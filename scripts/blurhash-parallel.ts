#!/usr/bin/env tsx

import { Worker } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { getBatchProcessingSize } from '../lib/settings';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Global flag to control job stopping
let shouldStopJob = false;

export interface PhotoTask {
  id: string;
  filepath: string;
  filename: string;
  s3Key?: string;
  originalPath?: string;
}

export interface ProcessResult {
  id: string;
  filename?: string;
  blurhash: string | null;
  success: boolean;
  error?: string;
  source?: 'local' | 's3';
}

export function requestJobStop() {
  shouldStopJob = true;
  console.log('🛑 Job stop requested');
}

export function resetStopFlag() {
  shouldStopJob = false;
}

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
    const workerPath = path.join(__dirname, 'blurhash-worker-only.ts');
    
    const worker = new Worker(workerPath, {
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
        photosRootPath: process.env.PHOTOS_ROOT_PATH,
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

export async function processBlurhashJobParallel(jobId: string) {
  console.log(`Starting parallelized blurhash job ${jobId}`);

  try {
    const envError = validateEnvironment();
    if (envError) {
      throw new Error(`Environment validation failed: ${envError}`);
    }

    // Get optimal worker count (CPU cores - 1, but at least 1)
    const maxWorkers = Math.max(1, os.cpus().length - 1);
    console.log(`Using ${maxWorkers} worker threads for parallel processing`);

    // Get batch size from settings (for database operations)
    const dbBatchSize = await getBatchProcessingSize();
    console.log(`Using database batch size: ${dbBatchSize}`);

    // For worker processing, use optimal parallel batch size
    const workerBatchSize = maxWorkers;
    console.log(`Processing ${workerBatchSize} photos concurrently per worker batch`);

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
        originalPath: true,
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
    let localPhotosUsed = 0;
    let s3PhotosUsed = 0;
    const errors: string[] = [];

    // Process photos in parallel batches optimized for worker threads
    for (let i = 0; i < photos.length; i += workerBatchSize) {
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

      const batch = photos.slice(i, i + workerBatchSize);
      console.log(`Processing batch ${Math.floor(i / workerBatchSize) + 1}/${Math.ceil(photos.length / workerBatchSize)} (${batch.length} photos with ${batch.length} workers)`);

      // Process entire batch in parallel using worker threads
      const results: ProcessResult[] = [];
      
      const workerPromises = batch.map(photo => 
        processPhotoInWorker({
          id: photo.id,
          filepath: photo.s3Key,
          s3Key: photo.s3Key,
          filename: photo.filename,
          originalPath: photo.originalPath,
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
            blurhash: null,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'Worker failed',
          });
        }
      }

      // Update database with results using database batch size for efficiency
      const successfulResults = results.filter(r => r.success && r.blurhash);
      
      if (successfulResults.length > 0) {
        // Process database updates in smaller batches to avoid overwhelming DB
        for (let dbStart = 0; dbStart < successfulResults.length; dbStart += dbBatchSize) {
          const dbBatch = successfulResults.slice(dbStart, dbStart + dbBatchSize);
          
          await prisma.$transaction(
            dbBatch.map(result => 
              prisma.photo.update({
                where: { id: result.id },
                data: { blurhash: result.blurhash },
              })
            )
          );
        }
      }

      // Update counters
      processedPhotos += results.length;
      localPhotosUsed += results.filter(r => r.source === 'local').length;
      s3PhotosUsed += results.filter(r => r.source === 's3').length;
      
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

      // Small delay between worker batches to prevent overwhelming the system
      if (i + workerBatchSize < photos.length) {
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

    console.log(`✅ Parallelized blurhash job ${jobId} completed!`);
    console.log(`📊 Processed ${processedPhotos}/${totalPhotos} photos`);
    console.log(`📊 Source statistics: ${localPhotosUsed} from local files, ${s3PhotosUsed} from S3`);
    console.log(`📊 Used ${maxWorkers} worker threads for parallel processing`);
    if (errors.length > 0) {
      console.log(`⚠️  Encountered ${errors.length} errors during processing`);
    }
  } catch (error) {
    console.error(`❌ Parallelized blurhash job ${jobId} failed:`, error);
    
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

export async function startBlurhashJobParallel() {
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
