import { scanner } from '@/lib/filesystem';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
import { enqueueUploadJob } from '@/lib/queues/uploadQueue';
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

export async function syncPhotos(jobId: string, selectedPaths: string[] | null, bullmqJob?: any) {
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

  // Helper function to update both database and BullMQ progress
  const updateProgress = async (progressData: {
    progress?: number;
    completedAlbums?: number;
    filesProcessed?: number;
    filesUploaded?: number;
    totalAlbums?: number;
    albumProgress?: any;
    logs?: boolean;
  }) => {
    // Prepare data for database update
    const dbData: any = { ...progressData };
    
    // Stringify albumProgress if it's an object, or set to null if empty
    if (dbData.albumProgress && typeof dbData.albumProgress === 'object') {
      // If the object is empty, set to null
      if (Object.keys(dbData.albumProgress).length === 0) {
        dbData.albumProgress = null;
      } else {
        dbData.albumProgress = JSON.stringify(dbData.albumProgress);
      }
    }
    
    // Update database
    await prisma.syncJob.update({
      where: { id: jobId },
      data: dbData,
    });

    // Update BullMQ job progress if available
    if (bullmqJob && typeof progressData.progress === 'number') {
      await bullmqJob.updateProgress(progressData.progress);
    }
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
    
    await updateProgress({ progress: 0 });

    // Get all albums from filesystem (then optionally filter by selectedPaths)
    const discoveredPaths = await scanner.getAllAlbums();
    const albumPaths = Array.isArray(selectedPaths) && selectedPaths.length > 0
      ? discoveredPaths.filter(p => selectedPaths!.includes(p))
      : discoveredPaths;
    
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
    await updateProgress({ 
      totalAlbums,
      completedAlbums: 0,
      filesProcessed: 0,
      filesUploaded: 0
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
        
        let shouldSkip = false;
        let skipReason = '';
        
        if (shouldSkip) {
          addLog('info', `⏭️ Skipping album "${albumData.name}": ${skipReason}`);
          
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
          
          await updateProgress({
            progress: progressPercent,
            completedAlbums: progress,
            albumProgress: albumProgress
          });
          
          continue;
        }
        
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
        
        await updateProgress({
          albumProgress: albumProgress
        });
        
        addLog('info', `Album "${albumData.name}" contains ${albumData.photos.length} photos and ${albumData.videos.length} videos`);
        
        const album = await prisma.album.upsert({
          where: { path: albumPath },
          update: {
            name: albumData.name,
            description: albumData.description,
            updatedAt: new Date(),
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

        const photoSyncResult = await syncAlbumPhotosConcurrent(
          album.id, 
          albumData.photos, 
          albumPath, 
          async (processed: number, uploaded: number) => {
            albumProgress[albumPath].photosProcessed = processed;
            albumProgress[albumPath].photosUploaded = uploaded;
            await updateProgress({
              albumProgress: albumProgress
            });
          },
          addLog
        );
        
        const videoSyncResult = await syncAlbumVideosConcurrent(
          album.id, 
          albumData.videos, 
          albumPath, 
          async (processed: number, uploaded: number) => {
            albumProgress[albumPath].videosProcessed = processed;
            albumProgress[albumPath].videosUploaded = uploaded;
            await updateProgress({
              albumProgress: albumProgress
            });
          },
          addLog
        );
        
        totalFilesProcessed += photoSyncResult.filesProcessed + videoSyncResult.filesProcessed;
        totalFilesUploaded += photoSyncResult.filesUploaded + videoSyncResult.filesUploaded;
        
        albumProgress[albumPath].issues = [...photoSyncResult.issues, ...videoSyncResult.issues];
        
        const allFilesUploaded = photoSyncResult.filesUploaded === albumData.photos.length && 
                                 videoSyncResult.filesUploaded === albumData.videos.length;
        const hasIssues = photoSyncResult.issues.length > 0 || videoSyncResult.issues.length > 0;
        
        await prisma.album.update({
          where: { id: album.id },
          data: {
            syncedToS3: true,
            localFilesSafeDelete: allFilesUploaded && !hasIssues, 
            lastSyncAt: new Date(),
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
        
        await updateProgress({
          progress: progressPercent,
          completedAlbums: progress,
          filesProcessed: totalFilesProcessed,
          filesUploaded: totalFilesUploaded,
          albumProgress: albumProgress
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

          await updateProgress({
            progress: progressPercent,
            completedAlbums: progress,
            albumProgress: albumProgress
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

    await updateProgress({
      progress: 100,
      albumProgress: albumProgress
    });

    // Mark job as completed in database
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
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
        errors: errorMsg
      },
    });
  }
}

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
        const photosInS3 = await prisma.photo.count({
          where: {
            albumId: dbAlbum.id,
            s3Key: { not: '' }
          }
        });

        if (photosInS3 > 0 && dbAlbum.syncedToS3) {
          logger('info', `Album "${dbAlbum.name}" has ${photosInS3} photos in S3 - marking as missing but recoverable`);
          
          await prisma.album.update({
            where: { id: dbAlbum.id },
            data: {
              localFilesSafeDelete: false,
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
          logger('info', `Album "${dbAlbum.name}" has no S3 files - cleaning up database records`);
          
          await prisma.photo.deleteMany({
            where: { albumId: dbAlbum.id }
          });

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

async function syncAlbumPhotosConcurrent(
  albumId: string, 
  photos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void | Promise<void>,
  logger?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{ filesProcessed: number; filesUploaded: number; issues: string[] }> {
  const batchSize = await getBatchProcessingSize();
  logger?.('info', `Using batch processing size: ${batchSize}`);

  const existingPhotos = await prisma.photo.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingPhotos.map((p: any) => p.filename));
  const currentFilenames = new Set(photos.map((p: any) => p.filename));

  let filesProcessed = 0;
  let filesUploaded = 0;
  const issues: string[] = [];

  const photosToDelete = existingPhotos.filter((p: any) => !currentFilenames.has(p.filename));
  for (const photo of photosToDelete) {
    try {
      await s3.deleteObject(photo.s3Key);
      logger?.('info', `Deleted orphaned photo from S3: ${photo.s3Key}`);
    } catch (error) {
      const errorMsg = `Error deleting S3 object ${photo.s3Key}: ${error}`;
      logger?.('error', errorMsg);
      issues.push(errorMsg);
    }
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  const newPhotos = photos.filter(photo => !existingFilenames.has(photo.filename));
  const existingPhotosToUpdate = photos.filter(photo => existingFilenames.has(photo.filename));

  const photosNeedingReupload: any[] = [];
  
  if (existingPhotosToUpdate.length > 0) {
    logger?.('info', `Checking ${existingPhotosToUpdate.length} existing photos for S3 presence`);
    
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
          return { needsReupload: true, photo: photoData };
        }
      }
      return { needsReupload: false, photo: photoData };
    };

    const existenceCheckResults = await processBatch(existingPhotosToUpdate, checkBatchSize, checkPhotoExists);
    
    for (const result of existenceCheckResults) {
      if (result.needsReupload) {
        photosNeedingReupload.push(result.photo);
      }
    }
    
    const photosNeedingReuploadFilenames = new Set(photosNeedingReupload.map(p => p.filename));
    const filteredExistingPhotos = existingPhotosToUpdate.filter(p => !photosNeedingReuploadFilenames.has(p.filename));
    existingPhotosToUpdate.length = 0;
    existingPhotosToUpdate.push(...filteredExistingPhotos);
    
    newPhotos.push(...photosNeedingReupload);
    
    if (photosNeedingReupload.length > 0) {
      logger?.('warn', `Found ${photosNeedingReupload.length} existing photos missing from S3 that will be re-uploaded`);
    }
  }

  if (newPhotos.length > 0) {
    logger?.('info', `Processing ${newPhotos.length} new photos in batches of ${batchSize}`);
    
    const processNewPhoto = async (photoData: any) => {
      try {
        await enqueueUploadJob({
          albumId,
          albumPath,
          photoData,
        });
        logger?.('info', `Enqueued upload job for: ${photoData.filename}`);
        return { success: true, filename: photoData.filename };
      } catch (error) {
        const errorMsg = `Failed to enqueue upload for ${photoData.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger?.('error', errorMsg);
        issues.push(errorMsg);
        return { success: false, filename: photoData.filename, error: errorMsg };
      }
    };

    const newPhotoResults = await processBatch(newPhotos, batchSize, processNewPhoto, async (processed, total, results) => {
      if (progressCallback) {
        const successfulEnqueues = results.filter((r: any) => r.success).length;
        await progressCallback(filesProcessed + processed, successfulEnqueues);
      }
    });
    
    const successfulEnqueues = newPhotoResults.filter(result => result.success).length;
    filesUploaded += successfulEnqueues;
    filesProcessed += newPhotos.length;

    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }

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

    await processBatch(existingPhotosToUpdate, Math.min(batchSize * 2, 10), updateExistingPhoto, async (processed, total, results) => {
      if (progressCallback) {
        await progressCallback(filesProcessed + processed, filesUploaded);
      }
    });
    filesProcessed += existingPhotosToUpdate.length;

    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

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
    
    if (progressCallback) {
      await progressCallback(results.length, items.length, results);
    }
  }
  
  return results;
}

async function syncAlbumVideosConcurrent(
  albumId: string, 
  videos: any[], 
  albumPath: string, 
  progressCallback?: (processed: number, uploaded: number) => void | Promise<void>,
  logger?: (level: 'info' | 'warn' | 'error', message: string, details?: any) => void
): Promise<{ filesProcessed: number; filesUploaded: number; issues: string[] }> {
  const batchSize = await getBatchProcessingSize();
  logger?.('info', `Using batch processing size for videos: ${batchSize}`);

  const existingVideos = await prisma.video.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingVideos.map((v: any) => v.filename));
  const currentFilenames = new Set(videos.map((v: any) => v.filename));

  let filesProcessed = 0;
  let filesUploaded = 0;
  const issues: string[] = [];

  const videosToDelete = existingVideos.filter((v: any) => !currentFilenames.has(v.filename));
  for (const video of videosToDelete) {
    try {
      await s3.deleteObject(video.s3Key);
      logger?.('info', `Deleted orphaned video from S3: ${video.s3Key}`);
    } catch (error) {
      const errorMsg = `Error deleting S3 object ${video.s3Key}: ${error}`;
      logger?.('error', errorMsg);
      issues.push(errorMsg);
    }
    await prisma.video.delete({ where: { id: video.id } });
  }

  const newVideos = videos.filter(video => !existingFilenames.has(video.filename));
  const existingVideosToUpdate = videos.filter(video => existingFilenames.has(video.filename));

  if (newVideos.length > 0) {
    logger?.('info', `Processing ${newVideos.length} new videos in batches of ${batchSize}`);
    
    const processNewVideo = async (videoData: any) => {
      const videoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, videoData.filename);
      const s3Key = s3.generateKey(albumPath, videoData.filename);
      
      try {
        const existsInS3 = await s3.objectExists(s3Key);
        
        if (existsInS3) {
          logger?.('info', `Video already exists in S3, skipping upload: ${videoData.filename}`);
        } else {
          logger?.('info', `Uploading new video: ${videoData.filename}`);
          
          const fileBuffer = await fs.readFile(videoPath);
          const mimeType = 'video/mp4'; // Simplified for now
          
          await s3.uploadFile(s3Key, fileBuffer, mimeType);
        }
        
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
        
        try {
          const { enqueueVideoThumbnailJob } = await import('@/lib/queues/videoThumbnailQueue');
          await enqueueVideoThumbnailJob({
            videoId: newVideo.id,
            originalPath: videoPath,
            s3Key,
            albumPath,
            filename: videoData.filename,
          })
          logger?.('info', `Enqueued thumbnails for video: ${videoData.filename}`);
        } catch (thumbnailError) {
          logger?.('warn', `Failed to enqueue thumbnails for video ${videoData.filename}: ${thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError)}`);
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

    const newVideoResults = await processBatch(newVideos, batchSize, processNewVideo, async (processed, total, results) => {
      if (progressCallback) {
        const successfulUploads = results.filter((r: any) => r.success).length;
        await progressCallback(filesProcessed + processed, filesUploaded + successfulUploads);
      }
    });
    
    const successfulUploads = newVideoResults.filter(result => result.success).length;
    filesUploaded += successfulUploads;
    filesProcessed += newVideos.length;

    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }

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

    await processBatch(existingVideosToUpdate, Math.min(batchSize * 2, 10), updateExistingVideo, async (processed, total, results) => {
      if (progressCallback) {
        await progressCallback(filesProcessed + processed, filesUploaded);
      }
    });
    filesProcessed += existingVideosToUpdate.length;

    if (progressCallback) {
      await progressCallback(filesProcessed, filesUploaded);
    }
  }
  
  return { filesProcessed, filesUploaded, issues };
}

export async function rebuildFromRemote(jobId: string, bullmqJob?: any) {
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

  // Helper function to update both database and BullMQ progress
  const updateProgress = async (progressData: {
    progress?: number;
    completedAlbums?: number;
    filesProcessed?: number;
    filesUploaded?: number;
    totalAlbums?: number;
    albumProgress?: any;
    logs?: boolean;
  }) => {
    // Prepare data for database update
    const dbData: any = { ...progressData };
    
    // Stringify albumProgress if it's an object, or set to null if empty
    if (dbData.albumProgress && typeof dbData.albumProgress === 'object') {
      // If the object is empty, set to null
      if (Object.keys(dbData.albumProgress).length === 0) {
        dbData.albumProgress = null;
      } else {
        dbData.albumProgress = JSON.stringify(dbData.albumProgress);
      }
    }
    
    // Update database
    await prisma.syncJob.update({
      where: { id: jobId },
      data: dbData,
    });

    // Update BullMQ job progress if available
    if (bullmqJob && typeof progressData.progress === 'number') {
      await bullmqJob.updateProgress(progressData.progress);
    }
  };

  try {
    addLog('info', 'Starting S3 rebuild process');

    const allS3Objects = await s3.listObjects('photos/');
    addLog('info', `Found ${allS3Objects.length} objects in S3 bucket.`);

    const albumsMap = new Map<string, { name: string, photos: any[] }>();

    for (const s3Key of allS3Objects) {
      const parts = s3Key.split('/');
      if (parts.length < 3) continue;

      const albumPath = parts.slice(1, -1).join('/');
      const filename = parts[parts.length - 1];

      if (!albumsMap.has(albumPath)) {
        albumsMap.set(albumPath, { name: path.basename(albumPath), photos: [] });
      }

      albumsMap.get(albumPath)!.photos.push({ s3Key, filename });
    }

    const totalAlbums = albumsMap.size;
    addLog('info', `Found ${totalAlbums} albums to process.`);

    await updateProgress({ totalAlbums });

    let completedAlbums = 0;
    for (const [albumPath, albumData] of albumsMap.entries()) {
      addLog('info', `Processing album: ${albumPath}`);

      const album = await prisma.album.upsert({
        where: { path: albumPath },
        update: { name: albumData.name },
        create: {
          path: albumPath,
          slug: await generateUniqueSlug(albumData.name),
          name: albumData.name,
          status: 'PUBLIC',
          enabled: true,
        },
      });

      for (const photoData of albumData.photos) {
        const existingPhoto = await prisma.photo.findFirst({
          where: { albumId: album.id, filename: photoData.filename },
        });

        if (!existingPhoto) {
          const newPhoto = await prisma.photo.create({
            data: {
              albumId: album.id,
              filename: photoData.filename,
              s3Key: photoData.s3Key,
              originalPath: path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, photoData.filename),
              fileSize: 0, 
            },
          });

          await enqueueUploadJob({
            albumId: album.id,
            albumPath: albumPath,
            photoData: { filename: newPhoto.filename, size: 0 },
          });

          addLog('info', `Created photo ${photoData.filename} and enqueued jobs.`);
        }
      }

      completedAlbums++;
      const progress = Math.round((completedAlbums / totalAlbums) * 100);

      await updateProgress({
        progress,
        completedAlbums
      });
    }

    await updateProgress({ progress: 100 });

    // Mark job as completed in database
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      },
    });

    addLog('info', 'S3 rebuild completed successfully.');

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLog('error', 'S3 rebuild job failed', { error: errorMsg });
    
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: errorMsg
      },
    });
  }
}
