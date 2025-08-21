import { NextRequest, NextResponse } from 'next/server';
import { scanner } from '@/lib/filesystem';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
import { generateThumbnails } from '@/lib/thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';
import { generateUniqueSlug } from '@/lib/slugs';
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

  try {
    addLog('info', 'Starting sync process');
    
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    // Get all albums from filesystem
    const albumPaths = await scanner.getAllAlbums();
    let progress = 0;
    const totalAlbums = albumPaths.length;
    let totalFilesProcessed = 0;
    let totalFilesUploaded = 0;
    
    addLog('info', `Found ${totalAlbums} albums to sync`);
    
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
        addLog('info', `Processing album: ${albumPath}`);
        const albumData = await scanner.scanDirectory(albumPath);
        
        // Track album start
        albumProgress[albumPath] = {
          status: 'PROCESSING',
          photosTotal: albumData.photos.length,
          photosProcessed: 0,
          photosUploaded: 0,
          issues: []
        };
        
        addLog('info', `Album "${albumData.name}" contains ${albumData.photos.length} photos`);
        
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
        const { filesProcessed, filesUploaded, issues } = await syncAlbumPhotosConcurrent(
          album.id, 
          albumData.photos, 
          albumPath, 
          (processed: number, uploaded: number) => {
            albumProgress[albumPath].photosProcessed = processed;
            albumProgress[albumPath].photosUploaded = uploaded;
          },
          addLog
        );
        
        totalFilesProcessed += filesProcessed;
        totalFilesUploaded += filesUploaded;
        
        // Store any issues that occurred during this album sync
        albumProgress[albumPath].issues = issues;
        
        // Mark album as synced - files are safe to delete only if all uploads succeeded
        const allFilesUploaded = filesUploaded === albumData.photos.length;
        const hasIssues = issues.length > 0;
        
        await prisma.album.update({
          where: { id: album.id },
          data: {
            syncedToS3: true,
            localFilesSafeDelete: allFilesUploaded && !hasIssues, // Only mark safe if ALL files uploaded and no issues
            lastSyncAt: new Date(),
          },
        });
        
        albumProgress[albumPath].status = 'COMPLETED';
        albumProgress[albumPath].safeToDelete = allFilesUploaded && !hasIssues;
        
        if (!allFilesUploaded || hasIssues) {
          const reason = !allFilesUploaded ? 
            `Only ${filesUploaded}/${albumData.photos.length} files uploaded successfully` :
            `Upload completed but with ${issues.length} issue(s)`;
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
        
        addLog('info', `✅ Album "${albumData.name}" processed (${filesUploaded}/${filesProcessed} files uploaded)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to sync album ${albumPath}`, { error: errorMsg });
        albumProgress[albumPath] = {
          status: 'ERROR',
          error: errorMsg
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

async function syncAlbumPhotos(
  albumId: string, 
  photos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void,
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
      progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

// Helper function to process items in batches with concurrency control
async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);
  }
  
  return results;
}

// Updated syncAlbumPhotos function with concurrent processing
async function syncAlbumPhotosConcurrent(
  albumId: string, 
  photos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void,
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
      const existingPhoto = existingPhotos.find(p => p.filename === photoData.filename);
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
    const newPhotoResults = await processBatch(newPhotos, batchSize, processNewPhoto);
    
    // Count successful uploads
    const successfulUploads = newPhotoResults.filter(result => result.success).length;
    filesUploaded += successfulUploads;
    filesProcessed += newPhotos.length;

    // Update progress after new photos
    if (progressCallback) {
      progressCallback(filesProcessed, filesUploaded);
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
    await processBatch(existingPhotosToUpdate, Math.min(batchSize * 2, 10), updateExistingPhoto);
    filesProcessed += existingPhotosToUpdate.length;

    // Final progress update
    if (progressCallback) {
      progressCallback(filesProcessed, filesUploaded);
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
    default:
      return 'application/octet-stream';
  }
}
