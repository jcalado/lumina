#!/usr/bin/env npx tsx

import dotenv from 'dotenv';
import { s3 } from '../lib/s3';

// Load environment variables
dotenv.config();

async function testS3Existence() {
  console.log('Testing S3 object existence check...');
  
  try {
    // Test with a key that likely doesn't exist
    const nonExistentKey = 'test/non-existent-file.jpg';
    const exists1 = await s3.objectExists(nonExistentKey);
    console.log(`❌ Non-existent file (${nonExistentKey}): ${exists1}`);
    
    // List some existing objects to test with
    console.log('\nListing some existing objects in S3...');
    const existingObjects = await s3.listObjects('photos/');
    
    if (existingObjects.length > 0) {
      const existingKey = existingObjects[0];
      console.log(`Testing with existing key: ${existingKey}`);
      const exists2 = await s3.objectExists(existingKey);
      console.log(`✅ Existing file (${existingKey}): ${exists2}`);
    } else {
      console.log('No existing photos found in S3 to test with.');
    }
    
    console.log('\n✅ S3 existence check test completed successfully!');
  } catch (error) {
    console.error('❌ Error testing S3 existence:', error);
  }
}

if (require.main === module) {
  testS3Existence();
}
