import { config } from 'dotenv';
import { S3Service } from '../lib/s3';

config();

async function listThumbnails() {
  try {
    const s3Service = new S3Service();
    
    console.log('Listing thumbnail objects in S3...');
    
    // List all thumbnail objects
    const thumbnailObjects = await s3Service.listObjects('thumbnails/');
    console.log(`Found ${thumbnailObjects.length} thumbnail objects:`);
    
    thumbnailObjects.forEach(key => {
      console.log(`- ${key}`);
    });
    
  } catch (error) {
    console.error('Error listing thumbnails:', error);
  }
}

listThumbnails();
