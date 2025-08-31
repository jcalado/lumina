import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { getUploadQueue, UploadJobData } from '../lib/queues/uploadQueue';
import { enqueueThumbnailJob } from '../lib/queues/thumbnailQueue';
import { enqueueExifJob } from '../lib/queues/exifQueue';
import { s3 } from '../lib/s3';
import fs from 'fs/promises';
import path from 'path';
import { getContentType } from '../lib/utils';

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

async function processUploadJob(job: any) {
  const { albumId, albumPath, photoData } = job.data as UploadJobData;
  console.log(`Processing upload for photo: ${photoData.filename} in album: ${albumPath}`);

  const photoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, photoData.filename);
  const s3Key = s3.generateKey(albumPath, photoData.filename);

  try {
    // 1. Upload photo to S3
    const fileBuffer = await fs.readFile(photoPath);
    const mimeType = getContentType(photoData.filename);
    await s3.uploadFile(s3Key, fileBuffer, mimeType);
    console.log(`Successfully uploaded to S3: ${s3Key}`);

    // 2. Create database entry
    const newPhoto = await prisma.photo.create({
      data: {
        albumId,
        filename: photoData.filename,
        originalPath: photoPath,
        s3Key: s3Key,
        metadata: JSON.stringify(photoData),
        fileSize: photoData.size,
        takenAt: photoData.takenAt || null,
      },
    });
    console.log(`Created database record for photoId: ${newPhoto.id}`);

    // 3. Enqueue subsequent jobs
    await enqueueThumbnailJob({
      photoId: newPhoto.id,
      s3Key,
    });
    console.log(`Enqueued thumbnail job for photoId: ${newPhoto.id}`);

    await enqueueExifJob({ 
      photoId: newPhoto.id 
    });
    console.log(`Enqueued EXIF job for photoId: ${newPhoto.id}`);

  } catch (error) {
    console.error(`Failed to process upload for photo: ${photoData.filename}`, error);
    // If the file doesn't exist locally anymore, don't retry.
    if (error.code === 'ENOENT') {
      job.discard();
      return;
    }
    throw error;
  }
}

function setupUploadWorker() {
  getUploadQueue(); // Ensure queue is initialized
  const worker = new Worker('uploads', processUploadJob, {
    connection: connection(),
    concurrency: 5, // Number of parallel uploads
  });

  worker.on('completed', (job) => {
    console.log(`Upload job ${job.id} has completed!`);
  });

  worker.on('failed', (job, err) => {
    console.log(`Upload job ${job?.id} has failed with ${err.message}`);
  });

  console.log('Upload worker started');
}

setupUploadWorker();
