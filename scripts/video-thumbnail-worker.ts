// Background worker script to process video thumbnail generation jobs
import { config } from 'dotenv';
import { generateMissingVideoThumbnails } from '../lib/video-thumbnails';

// Load environment variables
config();

console.log('Starting video thumbnail worker...');

let isRunning = true;

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down video thumbnail worker...');
  isRunning = false;
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down video thumbnail worker...');
  isRunning = false;
  process.exit(0);
});

// Main worker function
async function runVideoThumbnailWorker() {
  while (isRunning) {
    try {
      console.log('Checking for videos that need thumbnails...');
      const result = await generateMissingVideoThumbnails();
      
      if (result.total > 0) {
        console.log(`Processed ${result.processed}/${result.total} videos`);
      } else {
        console.log('No videos need thumbnail generation');
      }
      
      // Wait 60 seconds before checking again (videos are less frequent than photos)
      await new Promise(resolve => setTimeout(resolve, 60000));
    } catch (error) {
      console.error('Error in video thumbnail worker:', error);
      // Wait 120 seconds before retrying on error
      await new Promise(resolve => setTimeout(resolve, 120000));
    }
  }
}

console.log('Video thumbnail worker is running and checking for jobs...');
runVideoThumbnailWorker();
