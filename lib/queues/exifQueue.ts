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

let exifQueue: Queue | null = null;

export function getExifQueue(): Queue {
  if (!exifQueue) {
    exifQueue = new Queue('exif', { connection: connection() });
  }
  return exifQueue!;
}

export async function enqueueExifJob(data: { photoId: string }, opts: JobsOptions = {}) {
  const queue = getExifQueue();
  return queue.add('extract', data, {
    attempts: 3,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    ...opts,
  });
}
