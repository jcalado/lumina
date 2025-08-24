#!/usr/bin/env tsx

import { isMainThread, parentPort, workerData } from 'worker_threads';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

interface PhotoTask {
  id: string;
  originalPath: string;
  s3Key: string;
  albumPath: string;
  filename: string;
}

interface ThumbnailResult {
  id: string;
  filename?: string;
  success: boolean;
  thumbnailsCreated: number;
  error?: string;
  source?: 'local' | 's3';
}

// Thumbnail sizes configuration
const THUMBNAIL_SIZES = {
  SMALL: { width: 300, height: 300, size: 'SMALL' },
  MEDIUM: { width: 800, height: 800, size: 'MEDIUM' },
  LARGE: { width: 1200, height: 1200, size: 'LARGE' },
} as const;

// S3 configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const S3_BUCKET = process.env.S3_BUCKET || '';

async function getImageBuffer(originalPath: string, s3Key: string): Promise<{ buffer: Buffer, source: 'local' | 's3' }> {
  // Try local file first
  try {
    await fs.access(originalPath);
    const buffer = await fs.readFile(originalPath);
    return { buffer, source: 'local' };
  } catch (error) {
    // Fall back to S3
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      
      const response = await s3Client.send(command);
      const chunks: Uint8Array[] = [];
      
      if (response.Body) {
        const stream = response.Body as ReadableStream;
        const reader = stream.getReader();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      
      const buffer = Buffer.concat(chunks);
      return { buffer, source: 's3' };
    } catch (s3Error) {
      throw new Error(`Failed to read image from both local and S3: ${error} | ${s3Error}`);
    }
  }
}

function generateS3Key(albumPath: string, filename: string, size: string): string {
  const baseName = path.parse(filename).name;
  const extension = '.jpg'; // All thumbnails are JPEG
  const thumbnailFilename = `${baseName}_${size.toLowerCase()}${extension}`;
  
  // Remove leading slash and ensure proper path format
  const cleanAlbumPath = albumPath.replace(/^\/+/, '').replace(/\/+$/, '');
  return `${cleanAlbumPath}/thumbnails/${thumbnailFilename}`;
}

async function uploadThumbnail(s3Key: string, buffer: Buffer): Promise<void> {
  const command = {
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: 'image/jpeg',
  };

  await s3Client.send(new (await import('@aws-sdk/client-s3')).PutObjectCommand(command));
}

async function generateThumbnailsForPhoto(photoTask: PhotoTask): Promise<ThumbnailResult> {
  const { id, originalPath, s3Key, albumPath, filename } = photoTask;
  
  try {
    // Get image buffer
    const { buffer: imageBuffer, source } = await getImageBuffer(originalPath, s3Key);
    
    let thumbnailsCreated = 0;
    const thumbnails: Array<{ size: string, s3Key: string, width: number, height: number }> = [];
    
    // Generate thumbnails for each size
    for (const [sizeName, config] of Object.entries(THUMBNAIL_SIZES)) {
      try {
        // Process image with automatic orientation correction
        let processedImage = sharp(imageBuffer, { 
          failOnError: false,
          limitInputPixels: false
        }).rotate(); // Auto-applies EXIF orientation
        
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
        const thumbnailS3Key = generateS3Key(albumPath, filename, sizeName);
        
        // Upload to S3
        await uploadThumbnail(thumbnailS3Key, thumbnailBuffer);
        
        thumbnails.push({
          size: sizeName,
          s3Key: thumbnailS3Key,
          width: newWidth,
          height: newHeight
        });
        
        thumbnailsCreated++;
      } catch (error) {
        console.error(`Failed to generate ${sizeName} thumbnail for ${filename}:`, error);
        // Continue with other sizes
      }
    }
    
    return {
      id,
      filename,
      success: thumbnailsCreated > 0,
      thumbnailsCreated,
      source,
      thumbnails, // Include thumbnail info for database updates
    } as ThumbnailResult & { thumbnails: typeof thumbnails };
    
  } catch (error) {
    return {
      id,
      filename,
      success: false,
      thumbnailsCreated: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Worker thread execution
if (!isMainThread && parentPort) {
  parentPort.on('message', async (photoTask: PhotoTask) => {
    try {
      const result = await generateThumbnailsForPhoto(photoTask);
      parentPort!.postMessage({ success: true, result });
    } catch (error) {
      parentPort!.postMessage({ 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
}

export { generateThumbnailsForPhoto };
export type { PhotoTask, ThumbnailResult };
