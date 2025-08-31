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

let syncQueue: Queue | null = null;

export function getSyncQueue(): Queue {
  if (!syncQueue) {
    syncQueue = new Queue('sync', { connection: connection() });
  }
  return syncQueue!;
}

export async function enqueueSyncJob(
  data: { jobId: string; type: 'FILESYSTEM' | 'S3', selectedPaths?: string[] | null },
  opts: JobsOptions = {}
) {
  const queue = getSyncQueue();
  return queue.add(data.type, data, {
    attempts: 1, // Sync jobs should not be retried automatically
    removeOnComplete: { age: 3600 * 24, count: 100 }, // Keep for 24 hours
    removeOnFail: { age: 3600 * 24 * 7 }, // Keep for 7 days
    ...opts,
  });
}
