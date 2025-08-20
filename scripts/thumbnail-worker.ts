// Background worker script to process thumbnail generation jobs
import { config } from 'dotenv';
import { thumbnailWorker } from '../lib/thumbnails';

// Load environment variables
config();

console.log('Starting thumbnail worker...');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down thumbnail worker...');
  await thumbnailWorker.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down thumbnail worker...');
  await thumbnailWorker.close();
  process.exit(0);
});

// Error handling
thumbnailWorker.on('failed', (job, err) => {
  console.error(`Thumbnail job ${job?.id} failed:`, err);
});

thumbnailWorker.on('completed', (job, result) => {
  console.log(`Thumbnail job ${job.id} completed:`, result);
});

console.log('Thumbnail worker is running and waiting for jobs...');
