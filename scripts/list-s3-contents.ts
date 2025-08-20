import { config } from 'dotenv';
import { S3Service } from '../lib/s3';

config();

async function listS3Contents() {
  try {
    const s3Service = new S3Service();
    
    console.log('Listing S3 bucket contents...');
    
    // List all objects in the photos prefix
    const photoObjects = await s3Service.listObjects('photos/');
    console.log(`Found ${photoObjects.length} objects in photos/ prefix:`);
    
    photoObjects.forEach(key => {
      console.log(`- ${key}`);
    });
    
    // Also list test objects
    const testObjects = await s3Service.listObjects('test/');
    console.log(`\nFound ${testObjects.length} objects in test/ prefix:`);
    
    testObjects.forEach(key => {
      console.log(`- ${key}`);
    });
    
  } catch (error) {
    console.error('Error listing S3 contents:', error);
  }
}

listS3Contents();
