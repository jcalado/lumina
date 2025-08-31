#!/usr/bin/env tsx

import 'dotenv/config'
import { Worker } from 'bullmq';
import { syncPhotos, rebuildFromRemote } from '../lib/sync-logic';

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

async function processSyncJob(job: any) {
  const { jobId, type, selectedPaths } = job.data;
  console.log(`Processing sync job: ${jobId}, type: ${type}`);

  try {
    if (type === 'FILESYSTEM') {
      await syncPhotos(jobId, selectedPaths || null, job);
    } else if (type === 'S3') {
      await rebuildFromRemote(jobId, job);
    } else {
      throw new Error(`Unknown sync job type: ${type}`);
    }
  } catch (error) {
    console.error(`Failed to process sync job ${jobId}`, error);
    throw error;
  }
}

function setupSyncWorker() {
  const worker = new Worker('sync', processSyncJob, {
    connection: connection(),
    concurrency: 1, // Only run one sync job at a time
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
  });

  worker.on('failed', (job, err) => {
    console.log(`Job ${job?.id} has failed with ${err.message}`);
  });

  console.log('Sync worker started');
}

setupSyncWorker();
