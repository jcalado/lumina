#!/usr/bin/env tsx

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { encode } from 'blurhash';
import dotenv from 'dotenv';
import os from 'os';
import { getBatchProcessingSize } from '../lib/settings';

// Load environment variables
dotenv.config();

interface PhotoTask {
  id: string;
  s3Key: string;
  filename: string;
}

interface ProcessResult {
  id: string;
  filename: string;
  blurhash?: string;
  success: boolean;
  error?: string;
}

// Main thread functions (declared outside the conditional for exports)
let shouldStopJob = false;

function requestJobStop() {
  shouldStopJob = true;
  console.log('🛑 Job stop requested');
}

function resetStopFlag() {
  shouldStopJob = false;
}

// Worker thread code
if (!isMainThread) {
  const { photoTask, s3Config }: {
    photoTask: PhotoTask;
    s3Config: any;
  } = workerData;

  async function workerProcessPhoto(): Promise<ProcessResult> {
    try {
      console.log(`Worker processing: ${photoTask.filename}`);
      
      // Initialize S3 client in worker
      const s3 = new S3Client(s3Config);
      
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

      // Get photo buffer from S3
      const imageBuffer = await downloadFromS3(photoTask.s3Key);

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
  workerProcessPhoto()
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

// Main thread code
else {
  const prisma = new PrismaClient();

  function validateEnvironment(): string | null {
    const requiredEnvVars = {
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
      S3_SECRET_KEY: process.env.S3_SECRET_KEY,
    };

    for (const [key, value] of Object.entries(requiredEnvVars)) {
      if (!value) {
        return `Missing required environment variable: ${key}`;
      }
    }
    return null;
  }

  async function processPhotoInWorker(photoTask: PhotoTask): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          photoTask,
          s3Config: {
            region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.S3_ENDPOINT,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY!,
              secretAccessKey: process.env.S3_SECRET_KEY!,
            },
            bucket: process.env.S3_BUCKET,
          },
        },
      });

      worker.on('message', (result: ProcessResult) => {
        resolve(result);
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
      }, 60000); // 60 second timeout per photo
    });
  }

  async function processBlurhashJobParallel(jobId: string) {
    console.log(`Starting parallelized blurhash job ${jobId}`);

    try {
      const envError = validateEnvironment();
      if (envError) {
        throw new Error(`Environment validation failed: ${envError}`);
      }

      // Get optimal worker count (CPU cores - 1, but at least 1)
      const maxWorkers = Math.max(1, os.cpus().length - 1);
      console.log(`Using ${maxWorkers} worker threads for parallel processing`);

      // Get batch size from settings
      const batchSize = await getBatchProcessingSize();
      console.log(`Using batch processing size: ${batchSize}`);

      // Update job status to running
      await prisma.blurhashJob.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });

      // Get photos without blurhash
      const photos = await prisma.photo.findMany({
        where: {
          blurhash: null,
        },
        select: {
          id: true,
          s3Key: true,
          filename: true,
        },
      });

      const totalPhotos = photos.length;
      console.log(`Found ${totalPhotos} photos without blurhash`);

      // Update job with total count
      await prisma.blurhashJob.update({
        where: { id: jobId },
        data: { totalPhotos },
      });

      let processedPhotos = 0;
      const errors: string[] = [];

      // Process photos in parallel batches
      for (let i = 0; i < photos.length; i += batchSize) {
        // Check if job should be stopped
        if (shouldStopJob) {
          console.log('🛑 Job stopped by user request');
          await prisma.blurhashJob.update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errors: JSON.stringify(['Job stopped by user request']),
              processedPhotos,
            },
          });
          resetStopFlag();
          return;
        }

        // Check database status
        const currentJob = await prisma.blurhashJob.findUnique({
          where: { id: jobId },
          select: { status: true }
        });
        
        if (currentJob?.status !== 'RUNNING') {
          console.log('🛑 Job stopped by database update');
          resetStopFlag();
          return;
        }

        const batch = photos.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(photos.length / batchSize)} (${batch.length} photos)`);

        // Limit concurrent workers to prevent overwhelming the system
        const workerBatchSize = Math.min(maxWorkers, batch.length);
        const results: ProcessResult[] = [];

        // Process batch in parallel using worker threads
        for (let j = 0; j < batch.length; j += workerBatchSize) {
          const workerBatch = batch.slice(j, j + workerBatchSize);
          
          const workerPromises = workerBatch.map(photo =>
            processPhotoInWorker({
              id: photo.id,
              s3Key: photo.s3Key,
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
                error: result.reason instanceof Error ? result.reason.message : 'Worker failed',
              });
            }
          }
        }

        // Update database with results in batch
        const successfulResults = results.filter(r => r.success && r.blurhash);
        
        if (successfulResults.length > 0) {
          // Use transaction for batch updates
          await prisma.$transaction(
            successfulResults.map(result => 
              prisma.photo.update({
                where: { id: result.id },
                data: { blurhash: result.blurhash },
              })
            )
          );
        }

        // Update counters
        processedPhotos += results.length;
        
        const failedResults = results.filter(r => !r.success);
        for (const failed of failedResults) {
          errors.push(`Failed to process ${failed.filename}: ${failed.error}`);
        }

        // Update progress
        const progress = Math.round((processedPhotos / totalPhotos) * 100);
        await prisma.blurhashJob.update({
          where: { id: jobId },
          data: {
            progress,
            processedPhotos,
          },
        });
        
        console.log(`Batch completed: ${progress}% (${processedPhotos}/${totalPhotos})`);
        console.log(`Success: ${successfulResults.length}, Failed: ${failedResults.length}`);

        // Small delay between batches
        if (i + batchSize < photos.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Complete the job
      await prisma.blurhashJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          processedPhotos,
          completedAt: new Date(),
          errors: errors.length > 0 ? JSON.stringify(errors) : null,
        },
      });

      console.log(`Parallelized blurhash job ${jobId} completed!`);
      console.log(`📊 Processed ${processedPhotos}/${totalPhotos} photos`);
      console.log(`📊 Using ${maxWorkers} worker threads for parallel processing`);
      if (errors.length > 0) {
        console.log(`⚠️  Encountered ${errors.length} errors during processing`);
      }
    } catch (error) {
      console.error(`Parallelized blurhash job ${jobId} failed:`, error);
      
      await prisma.blurhashJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: JSON.stringify([error instanceof Error ? error.message : 'Unknown error']),
        },
      });
    }
  }

  async function startBlurhashJobParallel() {
    try {
      console.log('🚀 Starting parallelized blurhash job...');
      
      resetStopFlag();
      
      const envError = validateEnvironment();
      if (envError) {
        console.error('❌ Environment validation failed:', envError);
        return;
      }

      console.log('✅ Environment validation passed');
      console.log(`🧮 Available CPU cores: ${os.cpus().length}`);
      console.log(`👷 Will use ${Math.max(1, os.cpus().length - 1)} worker threads`);

      // Check for running job
      const runningJob = await prisma.blurhashJob.findFirst({
        where: { status: 'RUNNING' },
      });

      if (runningJob) {
        console.log('⚠️  A blurhash job is already running');
        return;
      }

      // Create new job
      const job = await prisma.blurhashJob.create({
        data: { status: 'PENDING' },
      });

      console.log(`Created parallelized blurhash job ${job.id}`);

      // Process the job with parallel workers
      await processBlurhashJobParallel(job.id);
    } catch (error) {
      console.error('Error starting parallelized blurhash job:', error);
    } finally {
      await prisma.$disconnect();
    }
  }

  // Run if called directly
  if (require.main === module) {
    startBlurhashJobParallel();
  }
}

// Export functions for use by other modules
export { requestJobStop, resetStopFlag };

// We need to conditionally export the main thread functions
if (isMainThread) {
  // These will be available when imported by other modules
  module.exports = {
    requestJobStop,
    resetStopFlag,
    startBlurhashJobParallel: async () => {
      const { startBlurhashJobParallel } = await import('./blurhash-parallel');
      return startBlurhashJobParallel();
    }
  };
}
