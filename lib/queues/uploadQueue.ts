import { Queue, JobsOptions } from 'bullmq';

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

let uploadQueue: Queue | null = null;

export function getUploadQueue(): Queue {
  if (!uploadQueue) {
    uploadQueue = new Queue('uploads', { connection: connection() });
  }
  return uploadQueue!;
}

export interface UploadJobData {
  albumId: string;
  albumPath: string;
  photoData: { // This is PhotoMetadata from filesystem.ts
    filename: string;
    size: number;
    takenAt?: Date;
  };
}

export async function enqueueUploadJob(data: UploadJobData, opts: JobsOptions = {}) {
  const queue = getUploadQueue();
  return queue.add('upload-photo', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    ...opts,
  });
}
