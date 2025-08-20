import { config } from 'dotenv';
import { S3Service } from '../lib/s3';
import * as fs from 'fs';

config();

async function testS3Upload() {
  try {
    const s3Service = new S3Service();
    
    // Create a small test file
    const testContent = Buffer.from('This is a test file');
    const testKey = 'test/test.txt';
    
    console.log('Testing S3 upload...');
    console.log('S3 Endpoint:', process.env.S3_ENDPOINT);
    console.log('S3 Bucket:', process.env.S3_BUCKET);
    
    // Upload test file
    const result = await s3Service.uploadFile(testKey, testContent, 'text/plain');
    console.log('Upload result:', result);
    
    // Try to get signed URL for the test file
    const signedUrl = await s3Service.getSignedUrl(testKey, 300);
    console.log('Signed URL:', signedUrl);
    
    // Test the signed URL
    const response = await fetch(signedUrl, { method: 'HEAD' });
    console.log('Test file access status:', response.status);
    
    // Cleanup
    await s3Service.deleteObject(testKey);
    console.log('Test file deleted successfully');
    
  } catch (error) {
    console.error('S3 test failed:', error);
  }
}

testS3Upload();
