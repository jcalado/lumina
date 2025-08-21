// Background worker script to process thumbnail generation jobs
import { config } from 'dotenv';
import { generateMissingThumbnails } from '../lib/thumbnails';

// Load environment variables
config();

console.log('Starting thumbnail worker...');

let isRunning = true;

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down thumbnail worker...');
  isRunning = false;
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down thumbnail worker...');
  isRunning = false;
  process.exit(0);
});

// Main worker function
async function runThumbnailWorker() {
  while (isRunning) {
    try {
      console.log('Checking for photos that need thumbnails...');
      const result = await generateMissingThumbnails();
      
      if (result.total > 0) {
        console.log(`Processed ${result.processed}/${result.total} photos`);
      } else {
        console.log('No photos need thumbnail generation');
      }
      
      // Wait 30 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      console.error('Error in thumbnail worker:', error);
      // Wait 60 seconds before retrying on error
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
}

console.log('Thumbnail worker is running and checking for jobs...');
runThumbnailWorker();
