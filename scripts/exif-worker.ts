import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { getExifQueue } from '../lib/queues/exifQueue';
import exifr from 'exifr';
import { s3 } from '../lib/s3';
import fs from 'fs/promises';
import path from 'path';

const connection = () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
  };
};

async function processExifJob(job: any) {
  const { photoId } = job.data;
  console.log(`Processing EXIF for photoId: ${photoId}`);

  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || !photo.originalPath) {
      throw new Error(`Photo with id ${photoId} not found or has no original path`);
    }

    let fileBuffer: Buffer;
    try {
      // First, try to read the file from local storage
      await fs.access(photo.originalPath);
      fileBuffer = await fs.readFile(photo.originalPath);
      console.log(`Found local file for photoId: ${photoId}`);
    } catch (error) {
      // If local file doesn't exist or can't be read, download from S3
      console.log(`Local file not found for photoId: ${photoId}. Downloading from S3.`);
      fileBuffer = await s3.getObject(photo.s3Key);

      // Save the file to its proper location
      const photosRoot = process.env.PHOTOS_ROOT_PATH;
      if (photosRoot) {
        const localPath = path.join(photosRoot, photo.originalPath);
        console.log(`💾 Saving downloaded file to: ${localPath}`);
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, fileBuffer);
        console.log(`✅ File saved successfully`);
      }
    }

    const exifData = await exifr.parse(fileBuffer);

    const metadata = JSON.parse(photo.metadata as string || '{}');
    const updatedMetadata = {
      ...metadata,
      exif: exifData,
    };

    await prisma.photo.update({
      where: { id: photoId },
      data: {
        metadata: JSON.stringify(updatedMetadata),
        takenAt: exifData.DateTimeOriginal || exifData.CreateDate || metadata.takenAt || null,
      },
    });

    console.log(`Successfully processed EXIF for photoId: ${photoId}`);
  } catch (error) {
    console.error(`Failed to process EXIF for photoId: ${photoId}`, error);
    throw error;
  }
}

function setupExifWorker() {
  const queue = getExifQueue(); // Ensure queue is initialized
  const worker = new Worker('exif', processExifJob, {
    connection: connection(),
    concurrency: 5, // Adjust concurrency as needed
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
  });

  worker.on('failed', (job, err) => {
    console.log(`Job ${job?.id} has failed with ${err.message}`);
  });

  console.log('EXIF worker started');
}

setupExifWorker();
