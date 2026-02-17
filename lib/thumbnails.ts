import sharp from 'sharp';
import { prisma } from './prisma';
import { S3Service } from './s3';
import { getBatchProcessingSize } from './settings';
import * as exifr from 'exifr';

// Thumbnail sizes as per CLAUDE.md spec
export const THUMBNAIL_SIZES = {
  SMALL: { width: 300, height: 300, size: 'SMALL' },
  MEDIUM: { width: 800, height: 800, size: 'MEDIUM' },
  LARGE: { width: 1200, height: 1200, size: 'LARGE' },
} as const;

interface ThumbnailJobData {
  photoId: string;
  s3Key: string;
  albumPath: string;
  filename: string;
  reprocess?: boolean;
}

// Direct thumbnail generation function (synchronous approach for development)
export async function generateThumbnails(jobData: ThumbnailJobData): Promise<{ thumbnailsCreated: number }> {
  const { photoId, s3Key, albumPath, filename, reprocess } = jobData;
  
  try {
    console.log(`Processing thumbnails for photo: ${filename}`);
    
    const s3Service = new S3Service();

    // If reprocessing, delete existing thumbnails for this photo first
    if (reprocess) {
      try {
        const existing = await prisma.thumbnail.findMany({ where: { photoId } });
        for (const t of existing) {
          try { await s3Service.deleteObject(t.s3Key); } catch {}
        }
        if (existing.length > 0) {
          await prisma.thumbnail.deleteMany({ where: { photoId } });
          console.log(`Deleted ${existing.length} existing thumbnails for ${filename}`);
        }
      } catch (e) {
        console.warn('Failed to cleanup old thumbnails before reprocess', e);
      }
    }
    let imageBuffer: Buffer;

    // Fetch image from S3
    console.log(`Fetching image from S3: ${s3Key}`);
    imageBuffer = await s3Service.getObject(s3Key);
    
    const thumbnailsCreated: any[] = [];
    
    // We'll use Sharp's built-in auto-rotation which reads EXIF orientation automatically
    
    // Generate thumbnails for each size
    for (const [sizeName, config] of Object.entries(THUMBNAIL_SIZES)) {
      try {
        // Process image with automatic orientation correction
        let processedImage = sharp(imageBuffer, { 
          failOnError: false,
          limitInputPixels: false
        })
        .rotate(); // This automatically applies EXIF orientation and removes EXIF data
        
        console.log(`Applied auto-orientation to ${filename}`);
        
        // Get original dimensions (after orientation correction)
        const metadata = await processedImage.metadata();
        
        // Calculate dimensions maintaining aspect ratio
        const { width: targetWidth, height: targetHeight } = config;
        let newWidth: number = targetWidth;
        let newHeight: number = targetHeight;
        
        if (metadata.width && metadata.height) {
          const aspectRatio = metadata.width / metadata.height;
          
          if (aspectRatio > 1) {
            // Landscape: fit to width
            newHeight = Math.round(targetWidth / aspectRatio);
          } else {
            // Portrait: fit to height
            newWidth = Math.round(targetHeight * aspectRatio);
          }
        }
        
        // Generate thumbnail buffer
        const thumbnailBuffer = await processedImage
          .resize(newWidth, newHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        
        // Generate S3 key for thumbnail
        const thumbnailS3Key = s3Service.generateKey(albumPath, filename, 'thumbnail') + `_${sizeName.toLowerCase()}`;
        
        // Upload to S3
        await s3Service.uploadFile(thumbnailS3Key, thumbnailBuffer, 'image/jpeg');
        
        // Create thumbnail record in database
        const thumbnail = await prisma.thumbnail.create({
          data: {
            photoId,
            size: config.size,
            s3Key: thumbnailS3Key,
            width: newWidth,
            height: newHeight,
          },
        });
        
        thumbnailsCreated.push(thumbnail);
        console.log(`Created ${sizeName} thumbnail: ${newWidth}x${newHeight}`);
        
      } catch (error) {
        console.error(`Error creating ${sizeName} thumbnail:`, error);
        // Continue with other sizes even if one fails
      }
    }
    
    console.log(`Completed thumbnail generation for ${filename}: ${thumbnailsCreated.length} thumbnails created`);
    
    return {
      thumbnailsCreated: thumbnailsCreated.length,
    };
    
  } catch (error) {
    console.error(`Thumbnail generation failed for ${filename}:`, error);
    throw error;
  }
}

// Legacy-compatible stubs to keep older routes compiling while BullMQ handles processing
export async function generateMissingThumbnails(): Promise<{ processed: number; total: number }> {
  return { processed: 0, total: 0 }
}

export async function reprocessAllThumbnails(): Promise<{ processed: number; total: number; deleted: number }> {
  return { processed: 0, total: 0, deleted: 0 }
}

// Helper function to generate thumbnails for existing photos without them
/*
 Legacy batch helpers removed in favor of BullMQ queue processing
 Keeping function stubs commented for reference
*/
/* export async function old_generateMissingThumbnails(): Promise<{ processed: number; total: number }> {
  try {
    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Using batch processing size: ${batchSize}`);

    // Find all photos that don't have thumbnails yet
    const photosWithoutThumbnails = await prisma.photo.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      select: {
        id: true,
        filename: true,


        s3Key: true,
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    console.log(`Found ${photosWithoutThumbnails.length} photos without thumbnails`);

    // Process thumbnails for each photo in batches
    let processed = 0;
    
    const processSinglePhoto = async (photo: any) => {
      try {
        await generateThumbnails({
          photoId: photo.id,


          s3Key: photo.s3Key,
          albumPath: photo.album.path,
          filename: photo.filename,
        });
        return { success: true, filename: photo.filename };
      } catch (error) {
        console.error(`Failed to generate thumbnails for ${photo.filename}:`, error);
        return { success: false, filename: photo.filename, error };
      }
    };

    // Process photos in batches
    for (let i = 0; i < photosWithoutThumbnails.length; i += batchSize) {
      const batch = photosWithoutThumbnails.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(photosWithoutThumbnails.length / batchSize)} (${batch.length} photos)`);

      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map(photo => processSinglePhoto(photo))
      );

      // Count successful thumbnail generations
      const successfulInBatch = batchResults.filter(result => result.success).length;
      processed += successfulInBatch;

      console.log(`Batch completed: ${processed}/${photosWithoutThumbnails.length} photos processed`);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < photosWithoutThumbnails.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return {
      processed,
      total: photosWithoutThumbnails.length,
    };
  } catch (error) {
    console.error('Error generating missing thumbnails:', error);
    throw error;
  }
} */

// Function to delete all existing thumbnails and regenerate them
/* export async function reprocessAllThumbnails(): Promise<{ processed: number; total: number; deleted: number }> {
  try {
    console.log('Starting reprocessing of all thumbnails...');
    const s3Service = new S3Service();

    // Get all photos with their thumbnails
    const allPhotos = await prisma.photo.findMany({
      select: {
        id: true,
        filename: true,


        s3Key: true,
        metadata: true,
        thumbnails: {
          select: {
            id: true,
            s3Key: true,
          },
        },
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    console.log(`Found ${allPhotos.length} photos to reprocess`);

    // Delete all existing thumbnails
    let deletedCount = 0;
    for (const photo of allPhotos) {
      if (photo.thumbnails.length > 0) {
        // Delete thumbnail files from S3
        for (const thumbnail of photo.thumbnails) {
          try {
            await s3Service.deleteObject(thumbnail.s3Key);
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete thumbnail from S3: ${thumbnail.s3Key}`, error);
          }
        }

        // Delete thumbnail records from database
        await prisma.thumbnail.deleteMany({
          where: { photoId: photo.id },
        });
      }
    }

    console.log(`Deleted ${deletedCount} thumbnail files from S3 and database`);

    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Using batch processing size: ${batchSize}`);

    // Regenerate thumbnails for all photos in batches
    let processed = 0;

    const processSinglePhoto = async (photo: any) => {
      try {
        await generateThumbnails({
          photoId: photo.id,


          s3Key: photo.s3Key,
          albumPath: photo.album.path,
          filename: photo.filename,
          // We don't need to manually extract orientation anymore - Sharp handles this automatically
        });

        processed++;
        console.log(`Regenerated thumbnails for ${photo.filename} (${processed}/${allPhotos.length})`);
      } catch (error) {
        console.error(`Failed to regenerate thumbnails for ${photo.filename}:`, error);
      }
    };

    // Process photos in batches
    for (let i = 0; i < allPhotos.length; i += batchSize) {
      const batch = allPhotos.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allPhotos.length / batchSize)}: ${batch.length} photos`);

      // Process all photos in the current batch concurrently
      await Promise.all(batch.map(processSinglePhoto));

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < allPhotos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Reprocessing completed: ${processed} photos processed, ${deletedCount} old thumbnails deleted`);

    return {
      processed,
      total: allPhotos.length,
      deleted: deletedCount,
    };
  } catch (error) {
    console.error('Error reprocessing all thumbnails:', error);
    throw error;
  }
} */
