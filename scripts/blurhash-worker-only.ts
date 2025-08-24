#!/usr/bin/env tsx

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { encode } from 'blurhash';
import fs from 'fs/promises';
import path from 'path';

interface PhotoTask {
  id: string;
  s3Key: string;
  filename: string;
  originalPath: string;
}

interface ProcessResult {
  id: string;
  filename: string;
  blurhash?: string;
  success: boolean;
  error?: string;
  source?: 'local' | 's3';
}

// This file is designed to run as a worker thread
if (!isMainThread) {
  const { photoTask, s3Config, photosRootPath }: { 
    photoTask: PhotoTask; 
    s3Config: any; 
    photosRootPath?: string; 
  } = workerData;

  async function processPhotoWorker(): Promise<ProcessResult> {
    try {
      console.log(`Worker processing: ${photoTask.filename}`);
      
      // Initialize S3 client in worker
      const s3 = new S3Client(s3Config);
      
      // Helper function to read local photo
      async function readLocalPhoto(originalPath: string): Promise<Buffer | null> {
        try {
          if (!photosRootPath) {
            return null;
          }

          let fullPath: string;
          if (path.isAbsolute(originalPath)) {
            fullPath = originalPath;
          } else {
            fullPath = path.join(photosRootPath, originalPath);
          }
          
          await fs.access(fullPath);
          const buffer = await fs.readFile(fullPath);
          console.log(`Worker read local file: ${fullPath} (${buffer.length} bytes)`);
          return buffer;
        } catch (error) {
          return null;
        }
      }

      // Helper function to download from S3
      async function downloadFromS3(s3Key: string): Promise<Buffer> {
        const command = new GetObjectCommand({
          Bucket: s3Config.bucket,
          Key: s3Key,
        });

        const response = await s3.send(command);
        if (!response.Body) {
          throw new Error('Empty response body from S3');
        }

        const chunks: Buffer[] = [];
        const reader = response.Body as any;
        
        if (reader.read) {
          for await (const chunk of reader) {
            chunks.push(chunk);
          }
        } else {
          chunks.push(Buffer.from(response.Body as any));
        }

        return Buffer.concat(chunks);
      }

      // Get photo buffer (local preferred, S3 fallback)
      let imageBuffer: Buffer;
      let source: 'local' | 's3';
      
      const localBuffer = await readLocalPhoto(photoTask.originalPath);
      if (localBuffer) {
        imageBuffer = localBuffer;
        source = 'local';
      } else {
        imageBuffer = await downloadFromS3(photoTask.s3Key);
        source = 's3';
      }

      // Generate blurhash (CPU-intensive work in worker thread)
      const { data, info } = await sharp(imageBuffer)
        .resize(32, 32, { fit: 'cover' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);

      return {
        id: photoTask.id,
        filename: photoTask.filename,
        blurhash,
        success: true,
        source,
      };
    } catch (error) {
      return {
        id: photoTask.id,
        filename: photoTask.filename,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Process the photo and send result back to main thread
  processPhotoWorker()
    .then(result => {
      parentPort?.postMessage(result);
    })
    .catch(error => {
      parentPort?.postMessage({
        id: photoTask.id,
        filename: photoTask.filename,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
}

export type { PhotoTask, ProcessResult };
