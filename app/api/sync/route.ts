import { NextRequest, NextResponse } from 'next/server';
import { scanner } from '@/lib/filesystem';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
import { generateThumbnails } from '@/lib/thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';
import { generateUniqueSlug } from '@/lib/slugs';
import { 
  generateAlbumFingerprint, 
  shouldSkipSync, 
  stringifyFingerprint,
  parseFingerprintString,
  compareFingerprints 
} from '@/lib/sync-fingerprint';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    // Create a new sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Start the sync process (in a real app, this would be a background job)
    syncPhotos(syncJob.id).catch(console.error);

    return NextResponse.json({
      jobId: syncJob.id,
      status: 'started',
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync' },
      { status: 500 }
    );
  }
}

async function syncPhotos(jobId: string) {
  const logs: Array<{timestamp: string, level: string, message: string, details?: any}> = [];
  
  const addLog = (level: 'info' | 'warn' | 'error', message: string, details?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details
    };
    logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`, details || '');
  };

  // Function to check if sync has been cancelled
  const checkCancellation = async () => {
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
      select: { status: true }
    });
    return job?.status === ('CANCELLED' as any);
  };

  try {
    addLog('info', 'Starting sync process');
    
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    // Get all albums from filesystem
    const albumPaths = await scanner.getAllAlbums();
    
    // Get all albums from database
    const databaseAlbums = await prisma.album.findMany({
      select: { id: true, path: true, name: true, syncedToS3: true, localFilesSafeDelete: true },
    });
    
    addLog('info', `Found ${albumPaths.length} albums in filesystem`);
    addLog('info', `Found ${databaseAlbums.length} albums in database`);
    
    // Reconciliation phase - identify orphaned albums
    const reconciliationResults = await reconcileAlbums(albumPaths, databaseAlbums, addLog);
    
    // Total albums includes both filesystem albums and reconciled albums
    const totalAlbums = albumPaths.length + reconciliationResults.reconciledAlbums.length;
    let progress = 0;
    let totalFilesProcessed = 0;
    let totalFilesUploaded = 0;
    
    addLog('info', `Total albums to process: ${totalAlbums} (${albumPaths.length} from filesystem, ${reconciliationResults.reconciledAlbums.length} reconciled)`);
    
    // Initialize job with album count
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { 
        totalAlbums,
        completedAlbums: 0,
        filesProcessed: 0,
        filesUploaded: 0,
        logs: JSON.stringify(logs)
      },
    });

    const albumProgress: Record<string, any> = {};

    for (const albumPath of albumPaths) {
      try {
        // Check for cancellation before processing each album
        if (await checkCancellation()) {
          addLog('info', 'Sync was cancelled by user');
          return; // Exit the sync process
        }

        addLog('info', `Processing album: ${albumPath}`);
        const albumData = await scanner.scanDirectory(albumPath);
        
        // Convert relative path to absolute path for fingerprint generation
        const absoluteAlbumPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath);
        
        // Generate current fingerprint
        const currentFingerprint = await generateAlbumFingerprint(absoluteAlbumPath, {
          name: albumData.name,
          description: albumData.description || undefined
        });
        
        // Check existing album data for fingerprint comparison
        const existingAlbum = await prisma.album.findUnique({
          where: { path: albumPath },
          include: { photos: true }
        });
        
        // Check if we should skip this sync (temporarily disabled until types are fixed)
        let shouldSkip = false;
        let skipReason = '';
        
        // TODO: Re-enable fingerprint checking once Prisma types are updated
        // if (existingAlbum && existingAlbum.syncFingerprint) {
        //   const skipCheck = shouldSkipSync(existingAlbum, currentFingerprint, 1);
        //   shouldSkip = skipCheck.shouldSkip;
        //   skipReason = skipCheck.reason || '';
        // }
        
        if (shouldSkip) {
          addLog('info', `⏭️ Skipping album "${albumData.name}": ${skipReason}`);
          
          // Track album as skipped
          albumProgress[albumPath] = {
            status: 'SKIPPED',
            reason: skipReason,
            photosTotal: albumData.photos.length,
            photosProcessed: albumData.photos.length,
            photosUploaded: albumData.photos.length,
            issues: []
          };
          
          progress++;
          const progressPercent = Math.round((progress / totalAlbums) * 100);
          
          await prisma.syncJob.update({
            where: { id: jobId },
            data: { 
              progress: progressPercent,
              completedAlbums: progress,
              albumProgress: JSON.stringify(albumProgress),
              logs: JSON.stringify(logs)
            },
          });
          
          continue;
        }
        
        // Track album start
        albumProgress[albumPath] = {
          status: 'PROCESSING',
          photosTotal: albumData.photos.length,
          videosTotal: albumData.videos.length,
          photosProcessed: 0,
          videosProcessed: 0,
          photosUploaded: 0,
          videosUploaded: 0,
          issues: [],
          fingerprintInfo: 'Generated fingerprint for sync optimization'
        };
        
        // Save initial processing status to database
        await prisma.syncJob.update({
          where: { id: jobId },
          data: { 
            albumProgress: JSON.stringify(albumProgress),
            logs: JSON.stringify(logs)
          },
        });
        
        addLog('info', `Album "${albumData.name}" contains ${albumData.photos.length} photos and ${albumData.videos.length} videos`);
        
        // Upsert album
        const album = await prisma.album.upsert({
          where: { path: albumPath },
          update: {
            name: albumData.name,
            description: albumData.description,
            updatedAt: new Date(),
            // Reset sync status when starting new sync
            syncedToS3: false,
            localFilesSafeDelete: false,
          },
          create: {
            path: albumPath,
            slug: await generateUniqueSlug(albumData.name),
            name: albumData.name,
            description: albumData.description,
            status: 'PUBLIC',
            enabled: true,
            syncedToS3: false,
            localFilesSafeDelete: false,
          },
        });

        // Update photos for this album with progress tracking
        const photoSyncResult = await syncAlbumPhotosConcurrent(
          album.id, 
          albumData.photos, 
          albumPath, 
          async (processed: number, uploaded: number) => {
            albumProgress[albumPath].photosProcessed = processed;
            albumProgress[albumPath].photosUploaded = uploaded;
            // Save progress to database during processing
            await prisma.syncJob.update({
              where: { id: jobId },
              data: { 
                albumProgress: JSON.stringify(albumProgress),
                logs: JSON.stringify(logs)
              },
            });
          },
          addLog
        );
        
        // Update videos for this album with progress tracking
        const videoSyncResult = await syncAlbumVideosConcurrent(
          album.id, 
          albumData.videos, 
          albumPath, 
          async (processed: number, uploaded: number) => {
            albumProgress[albumPath].videosProcessed = processed;
            albumProgress[albumPath].videosUploaded = uploaded;
            // Save progress to database during processing
            await prisma.syncJob.update({
              where: { id: jobId },
              data: { 
                albumProgress: JSON.stringify(albumProgress),
                logs: JSON.stringify(logs)
              },
            });
          },
          addLog
        );
        
        totalFilesProcessed += photoSyncResult.filesProcessed + videoSyncResult.filesProcessed;
        totalFilesUploaded += photoSyncResult.filesUploaded + videoSyncResult.filesUploaded;
        
        // Store any issues that occurred during this album sync
        albumProgress[albumPath].issues = [...photoSyncResult.issues, ...videoSyncResult.issues];
        
        // Mark album as synced - files are safe to delete only if all uploads succeeded
        const allFilesUploaded = photoSyncResult.filesUploaded === albumData.photos.length && 
                                 videoSyncResult.filesUploaded === albumData.videos.length;
        const hasIssues = photoSyncResult.issues.length > 0 || videoSyncResult.issues.length > 0;
        
        await prisma.album.update({
          where: { id: album.id },
          data: {
            syncedToS3: true,
            localFilesSafeDelete: allFilesUploaded && !hasIssues, // Only mark safe if ALL files uploaded and no issues
            lastSyncAt: new Date(),
            // TODO: Re-enable once Prisma types are updated
            // syncFingerprint: stringifyFingerprint(currentFingerprint),
            // lastSyncCheck: new Date(),
            // syncStatus: allFilesUploaded && !hasIssues ? 'SYNCED' : 'CHANGED',
          },
        });
        
        albumProgress[albumPath].status = 'COMPLETED';
        albumProgress[albumPath].safeToDelete = allFilesUploaded && !hasIssues;
        
        if (!allFilesUploaded || hasIssues) {
          const reason = !allFilesUploaded ? 
            `Only ${photoSyncResult.filesUploaded + videoSyncResult.filesUploaded}/${albumData.photos.length + albumData.videos.length} files uploaded successfully` :
            `Upload completed but with ${photoSyncResult.issues.length + videoSyncResult.issues.length} issue(s)`;
          addLog('warn', `Album "${albumData.name}" requires verification: ${reason}`);
          albumProgress[albumPath].verificationNeeded = reason;
        } else {
          addLog('info', `Album "${albumData.name}" fully synced - safe for local deletion`);
        }
        
        progress++;
        const progressPercent = Math.round((progress / totalAlbums) * 100);
        
        await prisma.syncJob.update({
          where: { id: jobId },
          data: { 
            progress: progressPercent,
            completedAlbums: progress,
            filesProcessed: totalFilesProcessed,
            filesUploaded: totalFilesUploaded,
            albumProgress: JSON.stringify(albumProgress),
            logs: JSON.stringify(logs)
          },
        });
        
        addLog('info', `✅ Album "${albumData.name}" processed (${photoSyncResult.filesUploaded + videoSyncResult.filesUploaded}/${photoSyncResult.filesProcessed + videoSyncResult.filesProcessed} files uploaded)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to sync album ${albumPath}`, { error: errorMsg });
        albumProgress[albumPath] = {
          status: 'ERROR',
          error: errorMsg
        };
      }
    }

    // Process reconciled albums (albums in database but missing from filesystem)
    if (reconciliationResults.reconciledAlbums.length > 0) {
      addLog('info', `Processing ${reconciliationResults.reconciledAlbums.length} reconciled albums`);
      
      for (const reconciledAlbum of reconciliationResults.reconciledAlbums) {
        try {
          albumProgress[`reconciled_${reconciledAlbum.id}`] = {
            status: 'RECONCILED',
            action: reconciledAlbum.action,
            albumName: reconciledAlbum.name,
            albumPath: reconciledAlbum.path
          };

          progress++;
          const progressPercent = Math.round((progress / totalAlbums) * 100);

          await prisma.syncJob.update({
            where: { id: jobId },
            data: { 
              progress: progressPercent,
              completedAlbums: progress,
              albumProgress: JSON.stringify(albumProgress),
              logs: JSON.stringify(logs)
            },
          });

          switch (reconciledAlbum.action) {
            case 'cleaned_up':
              addLog('info', `✅ Cleaned up orphaned album: ${reconciledAlbum.name}`);
              break;
            case 'marked_missing':
              addLog('warn', `⚠️ Marked album as missing local files: ${reconciledAlbum.name} (recoverable from S3)`);
              break;
            case 'restored':
              addLog('info', `✅ Restored album from S3: ${reconciledAlbum.name}`);
              break;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          addLog('error', `Failed to process reconciled album ${reconciledAlbum.name}`, { error: errorMsg });
          albumProgress[`reconciled_${reconciledAlbum.id}`] = {
            status: 'ERROR',
            error: errorMsg,
            action: reconciledAlbum.action,
            albumName: reconciledAlbum.name
          };
        }
      }
    }

    // Log orphaned albums that need manual review
    if (reconciliationResults.orphanedAlbums.length > 0) {
      addLog('warn', `Found ${reconciliationResults.orphanedAlbums.length} albums requiring manual review`);
      for (const orphaned of reconciliationResults.orphanedAlbums) {
        addLog('warn', `Manual review needed: ${orphaned.name} - ${orphaned.reason}`);
        albumProgress[`orphaned_${orphaned.id}`] = {
          status: 'NEEDS_REVIEW',
          reason: orphaned.reason,
          albumName: orphaned.name,
          albumPath: orphaned.path
        };
      }
    }

    // Mark job as completed
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        albumProgress: JSON.stringify(albumProgress),
        logs: JSON.stringify(logs)
      },
    });
    
    addLog('info', `🎉 Sync completed! ${totalFilesUploaded}/${totalFilesProcessed} files uploaded across ${totalAlbums} albums`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLog('error', 'Sync job failed', { error: errorMsg });
    
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: errorMsg,
        logs: JSON.stringify(logs)
      },
    });
  }
}

// Reconciliation function to handle albums in database but missing from filesystem
async function reconcileAlbums(
  filesystemAlbums: string[],
  databaseAlbums: Array<{ id: string; path: string; name: string; syncedToS3: boolean; localFilesSafeDelete: boolean }>,
  logger: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{
  reconciledAlbums: Array<{ id: string; path: string; name: string; action: 'restored' | 'marked_missing' | 'cleaned_up' }>;
  orphanedAlbums: Array<{ id: string; path: string; name: string; reason: string }>;
}> {
  const filesystemAlbumSet = new Set(filesystemAlbums);
  const orphanedAlbums: Array<{ id: string; path: string; name: string; reason: string }> = [];
  const reconciledAlbums: Array<{ id: string; path: string; name: string; action: 'restored' | 'marked_missing' | 'cleaned_up' }> = [];

  logger('info', 'Starting album reconciliation phase');

  for (const dbAlbum of databaseAlbums) {
    if (!filesystemAlbumSet.has(dbAlbum.path)) {
      logger('warn', `Found orphaned album in database: ${dbAlbum.name} (${dbAlbum.path})`);

      try {
        // Check if album has photos in S3
        const photosInS3 = await prisma.photo.count({
          where: {
            albumId: dbAlbum.id,
            s3Key: { not: '' }
          }
        });

        if (photosInS3 > 0 && dbAlbum.syncedToS3) {
          // Album has S3 files - mark for potential restoration
          logger('info', `Album "${dbAlbum.name}" has ${photosInS3} photos in S3 - marking as missing but recoverable`);
          
          await prisma.album.update({
            where: { id: dbAlbum.id },
            data: {
              localFilesSafeDelete: false,
              // Add a note that local files are missing
              description: `${dbAlbum.path ? 'Local files missing. ' : ''}${await getAlbumDescription(dbAlbum.id) || ''}`
            }
          });

          reconciledAlbums.push({
            id: dbAlbum.id,
            path: dbAlbum.path,
            name: dbAlbum.name,
            action: 'marked_missing'
          });
        } else if (photosInS3 === 0) {
          // No S3 files - safe to clean up
          logger('info', `Album "${dbAlbum.name}" has no S3 files - cleaning up database records`);
          
          // Delete all photos for this album
          await prisma.photo.deleteMany({
            where: { albumId: dbAlbum.id }
          });

          // Delete the album
          await prisma.album.delete({
            where: { id: dbAlbum.id }
          });

          reconciledAlbums.push({
            id: dbAlbum.id,
            path: dbAlbum.path,
            name: dbAlbum.name,
            action: 'cleaned_up'
          });
        } else {
          // Has some S3 files but not fully synced - keep as orphaned for manual review
          orphanedAlbums.push({
            id: dbAlbum.id,
            path: dbAlbum.path,
            name: dbAlbum.name,
            reason: `Partially synced: ${photosInS3} photos in S3 but syncedToS3=${dbAlbum.syncedToS3}`
          });
        }
      } catch (error) {
        logger('error', `Error reconciling album "${dbAlbum.name}": ${error}`);
        orphanedAlbums.push({
          id: dbAlbum.id,
          path: dbAlbum.path,
          name: dbAlbum.name,
          reason: `Reconciliation error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }
  }

  logger('info', `Reconciliation complete: ${reconciledAlbums.length} albums reconciled, ${orphanedAlbums.length} albums need manual review`);
  
  if (orphanedAlbums.length > 0) {
    logger('warn', `Albums requiring manual review: ${orphanedAlbums.map(a => a.name).join(', ')}`);
  }

  return { reconciledAlbums, orphanedAlbums };
}

// Helper function to get album description
async function getAlbumDescription(albumId: string): Promise<string | null> {
  try {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { description: true }
    });
    return album?.description || null;
  } catch {
    return null;
  }
}

async function syncAlbumPhotos(
  albumId: string, 
  photos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void | Promise<void>,
  logger?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{ filesProcessed: number; filesUploaded: number; issues: string[] }> {
  // Get existing photos for this album
  const existingPhotos = await prisma.photo.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingPhotos.map((p: any) => p.filename));
  const currentFilenames = new Set(photos.map((p: any) => p.filename));

  let filesProcessed = 0;
  let filesUploaded = 0;
  const issues: string[] = [];

  // Remove photos that no longer exist
  const photosToDelete = existingPhotos.filter((p: any) => !currentFilenames.has(p.filename));
  for (const photo of photosToDelete) {
    try {
      // Delete from S3
      await s3.deleteObject(photo.s3Key);
      logger?.('info', `Deleted orphaned photo from S3: ${photo.s3Key}`);
    } catch (error) {
      const errorMsg = `Error deleting S3 object ${photo.s3Key}: ${error}`;
      logger?.('error', errorMsg);
      issues.push(errorMsg);
    }
    // Delete from database
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  // Add or update photos
  for (const photoData of photos) {
    const photoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, photoData.filename);
    const s3Key = s3.generateKey(albumPath, photoData.filename);
    
    filesProcessed++;
    
    if (!existingFilenames.has(photoData.filename)) {
      try {
        logger?.('info', `Uploading new photo: ${photoData.filename}`);
        
        // Upload photo to S3
        const fileBuffer = await fs.readFile(photoPath);
        const mimeType = getContentType(photoData.filename);
        
        await s3.uploadFile(s3Key, fileBuffer, mimeType);
        
        // Create database entry
        const newPhoto = await prisma.photo.create({
          data: {
            albumId,
            filename: photoData.filename,
            originalPath: photoPath,
            s3Key: s3Key,
            metadata: JSON.stringify(photoData),
            fileSize: photoData.size,
            takenAt: photoData.takenAt || null,
          },
        });
        
        // Queue thumbnail generation for this photo
        await generateThumbnails({
          photoId: newPhoto.id,
          originalPath: photoPath,
          s3Key: s3Key,
          albumPath: albumPath,
          filename: photoData.filename,
        });
        
        filesUploaded++;
        logger?.('info', `Successfully uploaded and processed: ${photoData.filename}`);
      } catch (error) {
        const errorMsg = `Failed to upload ${photoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('error', errorMsg);
        issues.push(errorMsg);
      }
    } else {
      // Update existing photo metadata (no need to re-upload unless file changed)
      try {
        await prisma.photo.updateMany({
          where: {
            albumId,
            filename: photoData.filename,
          },
          data: {
            metadata: JSON.stringify(photoData),
            fileSize: photoData.size,
            takenAt: photoData.takenAt || null,
          },
        });
        logger?.('info', `Updated metadata for existing photo: ${photoData.filename}`);
      } catch (error) {
        const errorMsg = `Failed to update metadata for ${photoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('warn', errorMsg);
        issues.push(errorMsg);
      }
    }
    
    // Call progress callback if provided
    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

// Helper function to process items in batches with concurrency control
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  progressCallback?: (processed: number, total: number, results: R[]) => void | Promise<void>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);
    
    // Call progress callback after each batch if provided
    if (progressCallback) {
      await progressCallback(results.length, items.length, results);
    }
  }
  
  return results;
}

// Updated syncAlbumPhotos function with concurrent processing
async function syncAlbumPhotosConcurrent(
  albumId: string, 
  photos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void | Promise<void>,
  logger?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{ filesProcessed: number; filesUploaded: number; issues: string[] }> {
  // Get batch size from settings
  const batchSize = await getBatchProcessingSize();
  logger?.('info', `Using batch processing size: ${batchSize}`);

  // Get existing photos for this album
  const existingPhotos = await prisma.photo.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingPhotos.map((p: any) => p.filename));
  const currentFilenames = new Set(photos.map((p: any) => p.filename));

  let filesProcessed = 0;
  let filesUploaded = 0;
  const issues: string[] = [];

  // Remove photos that no longer exist
  const photosToDelete = existingPhotos.filter((p: any) => !currentFilenames.has(p.filename));
  for (const photo of photosToDelete) {
    try {
      // Delete from S3
      await s3.deleteObject(photo.s3Key);
      logger?.('info', `Deleted orphaned photo from S3: ${photo.s3Key}`);
    } catch (error) {
      const errorMsg = `Error deleting S3 object ${photo.s3Key}: ${error}`;
      logger?.('error', errorMsg);
      issues.push(errorMsg);
    }
    // Delete from database
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  // Separate new photos from existing ones
  const newPhotos = photos.filter(photo => !existingFilenames.has(photo.filename));
  const existingPhotosToUpdate = photos.filter(photo => existingFilenames.has(photo.filename));

  // Check existing photos to ensure their S3 files still exist and re-upload if missing
  const photosNeedingReupload: any[] = [];
  
  if (existingPhotosToUpdate.length > 0) {
    logger?.('info', `Checking ${existingPhotosToUpdate.length} existing photos for S3 presence`);
    
    // Process existence checks in batches to avoid overwhelming S3
    const checkBatchSize = Math.min(10, batchSize);
    
    const checkPhotoExists = async (photoData: any) => {
      const existingPhoto = existingPhotos.find((p: any) => p.filename === photoData.filename);
      if (existingPhoto && existingPhoto.s3Key) {
        try {
          const existsInS3 = await s3.objectExists(existingPhoto.s3Key);
          if (!existsInS3) {
            logger?.('warn', `Existing photo missing from S3, will re-upload: ${photoData.filename}`);
            return { needsReupload: true, photo: photoData };
          }
          return { needsReupload: false, photo: photoData };
        } catch (error) {
          logger?.('error', `Error checking S3 existence for ${photoData.filename}: ${error}`);
          // If we can't check, assume it's missing and re-upload
          return { needsReupload: true, photo: photoData };
        }
      }
      return { needsReupload: false, photo: photoData };
    };

    const existenceCheckResults = await processBatch(existingPhotosToUpdate, checkBatchSize, checkPhotoExists);
    
    // Separate photos that need re-upload from those that just need metadata updates
    for (const result of existenceCheckResults) {
      if (result.needsReupload) {
        photosNeedingReupload.push(result.photo);
      }
    }
    
    // Remove photos needing re-upload from existingPhotosToUpdate
    const photosNeedingReuploadFilenames = new Set(photosNeedingReupload.map(p => p.filename));
    const filteredExistingPhotos = existingPhotosToUpdate.filter(p => !photosNeedingReuploadFilenames.has(p.filename));
    existingPhotosToUpdate.length = 0;
    existingPhotosToUpdate.push(...filteredExistingPhotos);
    
    // Add photos needing re-upload to newPhotos array
    newPhotos.push(...photosNeedingReupload);
    
    if (photosNeedingReupload.length > 0) {
      logger?.('warn', `Found ${photosNeedingReupload.length} existing photos missing from S3 that will be re-uploaded`);
    }
  }

  // Process new photos in batches with concurrency
  if (newPhotos.length > 0) {
    logger?.('info', `Processing ${newPhotos.length} new photos in batches of ${batchSize}`);
    
    const processNewPhoto = async (photoData: any) => {
      const photoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, photoData.filename);
      const s3Key = s3.generateKey(albumPath, photoData.filename);
      
      try {
        // Check if file already exists in S3 before uploading
        const existsInS3 = await s3.objectExists(s3Key);
        
        if (existsInS3) {
          logger?.('info', `Photo already exists in S3, skipping upload: ${photoData.filename}`);
        } else {
          logger?.('info', `Uploading new photo: ${photoData.filename}`);
          
          // Upload photo to S3
          const fileBuffer = await fs.readFile(photoPath);
          const mimeType = getContentType(photoData.filename);
          
          await s3.uploadFile(s3Key, fileBuffer, mimeType);
        }
        
        // Create database entry
        const newPhoto = await prisma.photo.create({
          data: {
            albumId,
            filename: photoData.filename,
            originalPath: photoPath,
            s3Key: s3Key,
            metadata: JSON.stringify(photoData),
            fileSize: photoData.size,
            takenAt: photoData.takenAt || null,
          },
        });
        
        // Queue thumbnail generation for this photo
        await generateThumbnails({
          photoId: newPhoto.id,
          originalPath: photoPath,
          s3Key: s3Key,
          albumPath: albumPath,
          filename: photoData.filename,
        });
        
        logger?.('info', `Successfully uploaded and processed: ${photoData.filename}`);
        return { success: true, filename: photoData.filename };
      } catch (error) {
        const errorMsg = `Failed to upload ${photoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('error', errorMsg);
        issues.push(errorMsg);
        return { success: false, filename: photoData.filename, error: errorMsg };
      }
    };

    // Process new photos in batches
    const newPhotoResults = await processBatch(newPhotos, batchSize, processNewPhoto, async (processed, total, results) => {
      // Call progress callback after each batch
      if (progressCallback) {
        const successfulUploads = results.filter((r: any) => r.success).length;
        await progressCallback(filesProcessed + processed, filesUploaded + successfulUploads);
      }
    });
    
    // Count successful uploads
    const successfulUploads = newPhotoResults.filter(result => result.success).length;
    filesUploaded += successfulUploads;
    filesProcessed += newPhotos.length;

    // Update progress after new photos
    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }

  // Update existing photos metadata (can be done in parallel as well)
  if (existingPhotosToUpdate.length > 0) {
    logger?.('info', `Updating metadata for ${existingPhotosToUpdate.length} existing photos`);
    
    const updateExistingPhoto = async (photoData: any) => {
      try {
        await prisma.photo.updateMany({
          where: {
            albumId,
            filename: photoData.filename,
          },
          data: {
            metadata: JSON.stringify(photoData),
            fileSize: photoData.size,
            takenAt: photoData.takenAt || null,
          },
        });
        logger?.('info', `Updated metadata for existing photo: ${photoData.filename}`);
        return { success: true, filename: photoData.filename };
      } catch (error) {
        const errorMsg = `Failed to update metadata for ${photoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('warn', errorMsg);
        issues.push(errorMsg);
        return { success: false, filename: photoData.filename, error: errorMsg };
      }
    };

    // Process metadata updates in batches (smaller batch size for DB operations)
    await processBatch(existingPhotosToUpdate, Math.min(batchSize * 2, 10), updateExistingPhoto, async (processed, total, results) => {
      // Call progress callback after each batch
      if (progressCallback) {
        await progressCallback(filesProcessed + processed, filesUploaded);
      }
    });
    filesProcessed += existingPhotosToUpdate.length;

    // Final progress update
    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

// Video sync function with concurrent processing
async function syncAlbumVideosConcurrent(
  albumId: string, 
  videos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void | Promise<void>,
  logger?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{ filesProcessed: number; filesUploaded: number; issues: string[] }> {
  // Get batch size from settings
  const batchSize = await getBatchProcessingSize();
  logger?.('info', `Using batch processing size for videos: ${batchSize}`);

  // Get existing videos for this album
  const existingVideos = await prisma.video.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingVideos.map((v: any) => v.filename));
  const currentFilenames = new Set(videos.map((v: any) => v.filename));

  let filesProcessed = 0;
  let filesUploaded = 0;
  const issues: string[] = [];

  // Remove videos that no longer exist
  const videosToDelete = existingVideos.filter((v: any) => !currentFilenames.has(v.filename));
  for (const video of videosToDelete) {
    try {
      // Delete from S3
      await s3.deleteObject(video.s3Key);
      logger?.('info', `Deleted orphaned video from S3: ${video.s3Key}`);
    } catch (error) {
      const errorMsg = `Error deleting S3 object ${video.s3Key}: ${error}`;
      logger?.('error', errorMsg);
      issues.push(errorMsg);
    }
    // Delete from database
    await prisma.video.delete({ where: { id: video.id } });
  }

  // Separate new videos from existing ones
  const newVideos = videos.filter(video => !existingFilenames.has(video.filename));
  const existingVideosToUpdate = videos.filter(video => existingFilenames.has(video.filename));

  // Process new videos in batches with concurrency
  if (newVideos.length > 0) {
    logger?.('info', `Processing ${newVideos.length} new videos in batches of ${batchSize}`);
    
    const processNewVideo = async (videoData: any) => {
      const videoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, videoData.filename);
      const s3Key = s3.generateKey(albumPath, videoData.filename);
      
      try {
        // Check if file already exists in S3 before uploading
        const existsInS3 = await s3.objectExists(s3Key);
        
        if (existsInS3) {
          logger?.('info', `Video already exists in S3, skipping upload: ${videoData.filename}`);
        } else {
          logger?.('info', `Uploading new video: ${videoData.filename}`);
          
          // Upload video to S3
          const fileBuffer = await fs.readFile(videoPath);
          const mimeType = getContentType(videoData.filename);
          
          await s3.uploadFile(s3Key, fileBuffer, mimeType);
        }
        
        // Create database entry
        const newVideo = await prisma.video.create({
          data: {
            albumId,
            filename: videoData.filename,
            originalPath: videoPath,
            s3Key: s3Key,
            metadata: JSON.stringify(videoData),
            fileSize: videoData.size,
            takenAt: videoData.takenAt || null,
          },
        });
        
        // Generate video thumbnails
        try {
          const { generateVideoThumbnails } = await import('@/lib/video-thumbnails');
          await generateVideoThumbnails({
            videoId: newVideo.id,
            originalPath: videoPath,
            s3Key: s3Key,
            albumPath: albumPath,
            filename: videoData.filename,
          });
          logger?.('info', `Generated thumbnails for video: ${videoData.filename}`);
        } catch (thumbnailError) {
          logger?.('warn', `Failed to generate thumbnails for video ${videoData.filename}: ${thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError)}`);
          // Don't fail the entire sync if thumbnail generation fails
        }
        
        logger?.('info', `Successfully uploaded and processed: ${videoData.filename}`);
        return { success: true, filename: videoData.filename };
      } catch (error) {
        const errorMsg = `Failed to upload ${videoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('error', errorMsg);
        issues.push(errorMsg);
        return { success: false, filename: videoData.filename, error: errorMsg };
      }
    };

    // Process new videos in batches
    const newVideoResults = await processBatch(newVideos, batchSize, processNewVideo, async (processed, total, results) => {
      // Call progress callback after each batch
      if (progressCallback) {
        const successfulUploads = results.filter((r: any) => r.success).length;
        await progressCallback(filesProcessed + processed, filesUploaded + successfulUploads);
      }
    });
    
    // Count successful uploads
    const successfulUploads = newVideoResults.filter(result => result.success).length;
    filesUploaded += successfulUploads;
    filesProcessed += newVideos.length;

    // Update progress after new videos
    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }

  // Update existing videos metadata (can be done in parallel as well)
  if (existingVideosToUpdate.length > 0) {
    logger?.('info', `Updating metadata for ${existingVideosToUpdate.length} existing videos`);
    
    const updateExistingVideo = async (videoData: any) => {
      try {
        await prisma.video.updateMany({
          where: {
            albumId,
            filename: videoData.filename,
          },
          data: {
            metadata: JSON.stringify(videoData),
            fileSize: videoData.size,
            takenAt: videoData.takenAt || null,
          },
        });
        logger?.('info', `Updated metadata for existing video: ${videoData.filename}`);
        return { success: true, filename: videoData.filename };
      } catch (error) {
        const errorMsg = `Failed to update metadata for ${videoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('warn', errorMsg);
        issues.push(errorMsg);
        return { success: false, filename: videoData.filename, error: errorMsg };
      }
    };

    // Process metadata updates in batches
    await processBatch(existingVideosToUpdate, Math.min(batchSize * 2, 10), updateExistingVideo, async (processed, total, results) => {
      // Call progress callback after each batch
      if (progressCallback) {
        await progressCallback(filesProcessed + processed, filesUploaded);
      }
    });
    filesProcessed += existingVideosToUpdate.length;

    // Final progress update
    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    case '.m4v':
      return 'video/x-m4v';
    case '.3gp':
      return 'video/3gpp';
    case '.flv':
      return 'video/x-flv';
    case '.wmv':
      return 'video/x-ms-wmv';
    default:
      return 'application/octet-stream';
  }
}
