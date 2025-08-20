import sharp from 'sharp';
import { prisma } from './prisma';
import { S3Service } from './s3';
import * as fs from 'fs/promises';

// Thumbnail sizes as per CLAUDE.md spec
export const THUMBNAIL_SIZES = {
  SMALL: { width: 300, height: 300, size: 'SMALL' },
  MEDIUM: { width: 800, height: 800, size: 'MEDIUM' },
  LARGE: { width: 1200, height: 1200, size: 'LARGE' },
} as const;

interface ThumbnailJobData {
  photoId: string;
  originalPath: string;
  s3Key: string;
  albumPath: string;
  filename: string;
}

// Direct thumbnail generation function (synchronous approach for development)
export async function generateThumbnails(jobData: ThumbnailJobData): Promise<{ thumbnailsCreated: number }> {
  const { photoId, originalPath, s3Key, albumPath, filename } = jobData;
  
  try {
    console.log(`Processing thumbnails for photo: ${filename}`);
    
    const s3Service = new S3Service();
    let imageBuffer: Buffer;
    
    // Try to read from local file first, fall back to S3
    try {
      await fs.access(originalPath);
      imageBuffer = await fs.readFile(originalPath);
      console.log(`Reading image from local path: ${originalPath}`);
    } catch (error) {
      console.log(`Local file not found, fetching from S3: ${s3Key}`);
      try {
        imageBuffer = await s3Service.getObject(s3Key);
      } catch (s3Error) {
        throw new Error(`Failed to read image from both local and S3: ${error} | ${s3Error}`);
      }
    }
    
    const thumbnailsCreated = [];
    
    // Generate thumbnails for each size
    for (const [sizeName, config] of Object.entries(THUMBNAIL_SIZES)) {
      try {
        // Process image
        const processedImage = sharp(imageBuffer);
        
        // Get original dimensions
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

// Helper function to generate thumbnails for existing photos without them
export async function generateMissingThumbnails(): Promise<{ processed: number; total: number }> {
  try {
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
        originalPath: true,
        s3Key: true,
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    console.log(`Found ${photosWithoutThumbnails.length} photos without thumbnails`);

    // Generate thumbnails for each photo
    let processed = 0;
    for (const photo of photosWithoutThumbnails) {
      try {
        await generateThumbnails({
          photoId: photo.id,
          originalPath: photo.originalPath,
          s3Key: photo.s3Key,
          albumPath: photo.album.path,
          filename: photo.filename,
        });
        processed++;
      } catch (error) {
        console.error(`Failed to generate thumbnails for ${photo.filename}:`, error);
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
}
