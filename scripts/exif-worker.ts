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

    let exifData;
    try {
      exifData = await exifr.parse(fileBuffer);
    } catch (exifError) {
      console.log(`EXIF parsing failed for photoId: ${photoId}`, exifError);
      // Update photo with empty EXIF data
      let metadata;
      try {
        metadata = JSON.parse(photo.metadata as string || '{}');
      } catch (parseError) {
        console.log(`Failed to parse existing metadata for photoId: ${photoId}, using empty object`);
        metadata = {};
      }
      const updatedMetadata = {
        ...metadata,
        exif: null,
        exifError: exifError instanceof Error ? exifError.message : String(exifError),
      };

      await prisma.photo.update({
        where: { id: photoId },
        data: {
          metadata: JSON.stringify(updatedMetadata),
          takenAt: metadata.takenAt || null,
        },
      });

      console.log(`Successfully processed photo with EXIF parsing error for photoId: ${photoId}`);
      return;
    }

    if (!exifData) {
      console.log(`No EXIF data found for photoId: ${photoId}`);
      // Update photo with empty EXIF data
      let metadata;
      try {
        metadata = JSON.parse(photo.metadata as string || '{}');
      } catch (parseError) {
        console.log(`Failed to parse existing metadata for photoId: ${photoId}, using empty object`);
        metadata = {};
      }
      const updatedMetadata = {
        ...metadata,
        exif: null,
      };

      await prisma.photo.update({
        where: { id: photoId },
        data: {
          metadata: JSON.stringify(updatedMetadata),
          takenAt: metadata.takenAt || null,
        },
      });

      console.log(`Successfully processed photo with no EXIF data for photoId: ${photoId}`);
      return;
    }

    console.log(`EXIF data extracted for photoId: ${photoId}`);
    console.log(`- DateTimeOriginal: ${exifData.DateTimeOriginal || 'not found'}`);
    console.log(`- CreateDate: ${exifData.CreateDate || 'not found'}`);
    console.log(`- DateTime: ${exifData.DateTime || 'not found'}`);
    console.log(`- DateTimeDigitized: ${exifData.DateTimeDigitized || 'not found'}`);
    console.log(`- Camera: ${exifData.Make} ${exifData.Model || ''}`.trim() || 'not found');
    console.log(`- GPS: ${exifData.latitude && exifData.longitude ? `${exifData.latitude}, ${exifData.longitude}` : 'not found'}`);

    let metadata;
    try {
      metadata = JSON.parse(photo.metadata as string || '{}');
    } catch (parseError) {
      console.log(`Failed to parse existing metadata for photoId: ${photoId}, using empty object`);
      metadata = {};
    }
    const updatedMetadata = {
      ...metadata,
      exif: exifData,
    };

    await prisma.photo.update({
      where: { id: photoId },
      data: {
        metadata: JSON.stringify(updatedMetadata),
        takenAt: (exifData.DateTimeOriginal || exifData.CreateDate || exifData.DateTime || exifData.DateTimeDigitized) || metadata.takenAt || null,
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
