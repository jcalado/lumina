#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { encode } from 'blurhash';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Validate required environment variables
const requiredEnvVars = {
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
};

function validateEnvironment(): string | null {
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      return `Missing required environment variable: ${key}`;
    }
  }
  return null;
}

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function generateBlurhash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize image to a small size for blurhash processing
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Generate blurhash
    const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
    return blurhash;
  } catch (error) {
    console.error('Error generating blurhash:', error);
    throw error;
  }
}

async function downloadFromS3(s3Key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
    });

    const response = await s3.send(command);
    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const reader = response.Body as any;
    
    if (reader.read) {
      // Handle readable stream
      for await (const chunk of reader) {
        chunks.push(chunk);
      }
    } else {
      // Handle buffer directly
      chunks.push(Buffer.from(response.Body as any));
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error downloading from S3 (${s3Key}):`, error);
    throw error;
  }
}

async function processBlurhashJob(jobId: string) {
  console.log(`Starting blurhash job ${jobId}`);

  try {
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

    for (const photo of photos) {
      try {
        console.log(`Processing photo ${photo.filename} (${processedPhotos + 1}/${totalPhotos})`);

        // Download image from S3
        const imageBuffer = await downloadFromS3(photo.s3Key);

        // Generate blurhash
        const blurhash = await generateBlurhash(imageBuffer);

        // Update photo with blurhash
        await prisma.photo.update({
          where: { id: photo.id },
          data: { blurhash },
        });

        processedPhotos++;

        // Update job progress every 10 photos or at the end
        if (processedPhotos % 10 === 0 || processedPhotos === totalPhotos) {
          const progress = Math.round((processedPhotos / totalPhotos) * 100);
          await prisma.blurhashJob.update({
            where: { id: jobId },
            data: {
              progress,
              processedPhotos,
            },
          });
          console.log(`Progress: ${progress}% (${processedPhotos}/${totalPhotos})`);
        }
      } catch (error) {
        const errorMessage = `Error processing photo ${photo.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMessage);
        errors.push(errorMessage);
        processedPhotos++;
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

    console.log(`Blurhash job ${jobId} completed. Processed ${processedPhotos}/${totalPhotos} photos`);
    if (errors.length > 0) {
      console.log(`Encountered ${errors.length} errors during processing`);
    }
  } catch (error) {
    console.error(`Blurhash job ${jobId} failed:`, error);
    
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

async function startBlurhashJob() {
  try {
    // Validate environment variables first
    const envError = validateEnvironment();
    if (envError) {
      console.error('❌ Environment validation failed:', envError);
      console.error('Please ensure the following environment variables are set:');
      console.error('- S3_BUCKET_NAME');
      console.error('- AWS_ACCESS_KEY_ID');
      console.error('- AWS_SECRET_ACCESS_KEY');
      console.error('- AWS_REGION (optional, defaults to us-east-1)');
      return;
    }

    // Check if there's already a running job
    const runningJob = await prisma.blurhashJob.findFirst({
      where: {
        status: 'RUNNING',
      },
    });

    if (runningJob) {
      console.log('A blurhash job is already running');
      return;
    }

    // Create new job
    const job = await prisma.blurhashJob.create({
      data: {
        status: 'PENDING',
      },
    });

    console.log(`Created blurhash job ${job.id}`);

    // Process the job
    await processBlurhashJob(job.id);
  } catch (error) {
    console.error('Error starting blurhash job:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  startBlurhashJob();
}

export { startBlurhashJob, processBlurhashJob };
