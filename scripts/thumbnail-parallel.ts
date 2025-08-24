#!/usr/bin/env tsx

import { Worker } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { getBatchProcessingSize } from '../lib/settings';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Global flag to control job stopping
let shouldStopJob = false;

export interface PhotoTask {
  id: string;
  originalPath: string;
  s3Key: string;
  albumPath: string;
  filename: string;
}

export interface ThumbnailResult {
  id: string;
  filename?: string;
  success: boolean;
  thumbnailsCreated: number;
  error?: string;
  source?: 'local' | 's3';
  thumbnails?: Array<{
    size: string;
    s3Key: string;
    width: number;
    height: number;
  }>;
}

export function requestJobStop() {
  shouldStopJob = true;
  console.log('🛑 Thumbnail job stop requested');
}

export function resetStopFlag() {
  shouldStopJob = false;
}

function validateEnvironment(): string | null {
  const requiredEnvVars = {
    S3_BUCKET: process.env.S3_BUCKET,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      return `Missing required environment variable: ${key}`;
    }
  }

  return null;
}

async function processPhotoInWorker(photoTask: PhotoTask): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'thumbnail-worker-only.ts');
    const worker = new Worker(workerPath, {
      workerData: photoTask,
    });

    worker.postMessage(photoTask);

    worker.on('message', (message) => {
      worker.terminate();
      if (message.success) {
        resolve(message.result);
      } else {
        reject(new Error(message.error));
      }
    });

    worker.on('error', (error) => {
      reject(error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    // Set a timeout to prevent hanging workers
    setTimeout(() => {
      worker.terminate();
      reject(new Error(`Worker timeout for ${photoTask.filename}`));
    }, 120000); // 2 minute timeout per photo (longer than blurhash due to multiple thumbnails)
  });
}

export async function processThumbnailJobParallel(jobId: string) {
  console.log(`Starting parallelized thumbnail job ${jobId}`);

  try {
    const envError = validateEnvironment();
    if (envError) {
      throw new Error(`Environment validation failed: ${envError}`);
    }

    // Get optimal worker count (CPU cores - 1, but at least 1)
    const maxWorkers = Math.max(1, os.cpus().length - 1);
    console.log(`Using ${maxWorkers} worker threads for parallel thumbnail processing`);

    // Get batch size from settings (for database operations)
    const dbBatchSize = await getBatchProcessingSize();
    console.log(`Using database batch size: ${dbBatchSize}`);

    // For worker processing, use optimal parallel batch size
    const workerBatchSize = maxWorkers;
    console.log(`Processing ${workerBatchSize} photos concurrently per worker batch`);

    // Update job status to running
    await (prisma as any).thumbnailJob?.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Get photos without thumbnails
    const photos = await prisma.photo.findMany({
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

    const totalPhotos = photos.length;
    console.log(`Found ${totalPhotos} photos without thumbnails`);

    // Update job with total count
    await (prisma as any).thumbnailJob?.update({
      where: { id: jobId },
      data: { totalPhotos },
    });

    let processedPhotos = 0;
    let thumbnailsCreated = 0;
    let localPhotosUsed = 0;
    let s3PhotosUsed = 0;
    const errors: string[] = [];

    // Process photos in parallel batches optimized for worker threads
    for (let i = 0; i < photos.length; i += workerBatchSize) {
      // Check if job should be stopped
      if (shouldStopJob) {
        console.log('🛑 Job stopped by user request');
        await (prisma as any).thumbnailJob?.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errors: JSON.stringify(['Job stopped by user request']),
            processedPhotos,
            thumbnailsCreated,
          },
        });
        resetStopFlag();
        return;
      }

      // Check database status
      const currentJob = await (prisma as any).thumbnailJob?.findUnique({
        where: { id: jobId },
        select: { status: true }
      });
      
      if (currentJob?.status !== 'RUNNING') {
        console.log('🛑 Job stopped by database update');
        resetStopFlag();
        return;
      }

      const batch = photos.slice(i, i + workerBatchSize);
      console.log(`Processing batch ${Math.floor(i / workerBatchSize) + 1}/${Math.ceil(photos.length / workerBatchSize)} (${batch.length} photos with ${batch.length} workers)`);

      // Process entire batch in parallel using worker threads
      const results: ThumbnailResult[] = [];
      
      const workerPromises = batch.map(photo => 
        processPhotoInWorker({
          id: photo.id,
          originalPath: photo.originalPath,
          s3Key: photo.s3Key,
          albumPath: photo.album.path,
          filename: photo.filename,
        })
      );

      const workerResults = await Promise.allSettled(workerPromises);
      
      for (const result of workerResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push(`Worker failed: ${result.reason}`);
          results.push({
            id: 'unknown',
            filename: 'unknown',
            success: false,
            thumbnailsCreated: 0,
            error: result.reason instanceof Error ? result.reason.message : 'Worker failed',
          });
        }
      }

      // Update database with results using database batch size for efficiency
      const successfulResults = results.filter(r => r.success && r.thumbnailsCreated > 0);
      
      if (successfulResults.length > 0) {
        // Process database updates in smaller batches to avoid overwhelming DB
        for (let dbStart = 0; dbStart < successfulResults.length; dbStart += dbBatchSize) {
          const dbBatch = successfulResults.slice(dbStart, dbStart + dbBatchSize);
          
          // Create thumbnail records in database
          await prisma.$transaction(
            dbBatch.flatMap(result => 
              (result.thumbnails || []).map(thumbnail =>
                prisma.thumbnail.create({
                  data: {
                    photoId: result.id,
                    size: thumbnail.size as 'SMALL' | 'MEDIUM' | 'LARGE',
                    s3Key: thumbnail.s3Key,
                    width: thumbnail.width,
                    height: thumbnail.height,
                  },
                })
              )
            )
          );
        }
      }

      // Update counters
      processedPhotos += results.length;
      thumbnailsCreated += results.reduce((sum, r) => sum + r.thumbnailsCreated, 0);
      localPhotosUsed += results.filter(r => r.source === 'local').length;
      s3PhotosUsed += results.filter(r => r.source === 's3').length;
      
      const failedResults = results.filter(r => !r.success);
      for (const failed of failedResults) {
        errors.push(`Failed to process ${failed.filename}: ${failed.error}`);
      }

      // Update progress
      const progress = Math.round((processedPhotos / totalPhotos) * 100);
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          progress,
          processedPhotos,
          thumbnailsCreated,
        },
      });

      console.log(`Batch completed: ${progress}% (${processedPhotos}/${totalPhotos})`);
      console.log(`Success: ${successfulResults.length}, Failed: ${failedResults.length}, Thumbnails created: ${thumbnailsCreated}`);

      // Small delay between worker batches to prevent overwhelming the system
      if (i + workerBatchSize < photos.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Complete the job
    await (prisma as any).thumbnailJob?.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        progress: 100,
        processedPhotos: totalPhotos,
        thumbnailsCreated,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    console.log(`✅ Parallelized thumbnail job ${jobId} completed!`);
    console.log(`📊 Statistics:`);
    console.log(`   - Photos processed: ${processedPhotos}/${totalPhotos}`);
    console.log(`   - Thumbnails created: ${thumbnailsCreated}`);
    console.log(`   - Local photos used: ${localPhotosUsed}`);
    console.log(`   - S3 photos used: ${s3PhotosUsed}`);
    console.log(`   - Errors: ${errors.length}`);

  } catch (error) {
    console.error('Error during parallelized thumbnail processing:', error);
    
    // Mark job as failed
    await (prisma as any).thumbnailJob?.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify([error instanceof Error ? error.message : String(error)]),
      },
    });
    
    throw error;
  } finally {
    resetStopFlag();
  }
}

export async function startThumbnailJobParallel() {
  try {
    // Check if there's already a running job
    const runningJob = await (prisma as any).thumbnailJob?.findFirst({
      where: {
        status: 'RUNNING',
      },
    });

    if (runningJob) {
      console.log('⚠️  A thumbnail job is already running');
      return;
    }

    // Create new job
    const job = await (prisma as any).thumbnailJob?.create({
      data: { status: 'PENDING' },
    });

    console.log(`Created parallelized thumbnail job ${job.id}`);

    // Process the job with parallel workers
    await processThumbnailJobParallel(job.id);
  } catch (error) {
    console.error('Error starting parallelized thumbnail job:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  startThumbnailJobParallel();
}
