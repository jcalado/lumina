import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Load environment variables
dotenv.config();

console.log('🧪 Testing Photo Upload to Backblaze B2');
console.log('======================================');

const config = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
};

const s3Client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  credentials: {
    accessKeyId: config.accessKey || '',
    secretAccessKey: config.secretKey || '',
  },
  forcePathStyle: true,
});

async function testPhotoUpload() {
  const photoPath = 'C:\\fotos\\Acampamentos\\Inter Regional - Norte e Centro\\InterRegional.jpg';
  
  try {
    console.log(`1. Checking if photo exists: ${photoPath}`);
    const stats = await fs.stat(photoPath);
    console.log(`✅ Photo found! Size: ${Math.round(stats.size / 1024)}KB`);
    console.log('');
    
    console.log('2. Reading photo file...');
    const fileBuffer = await fs.readFile(photoPath);
    console.log(`✅ Photo read successfully. Buffer size: ${fileBuffer.length} bytes`);
    console.log('');
    
    console.log('3. Generating S3 key...');
    const albumPath = 'Acampamentos/Inter Regional - Norte e Centro';
    const filename = 'InterRegional.jpg';
    
    // Generate key the same way the app does
    const cleanPath = albumPath.replace(/^\/+|\/+$/g, '');
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `photos/${cleanPath}/${cleanFilename}`;
    
    console.log(`✅ S3 Key: ${s3Key}`);
    console.log('');
    
    console.log('4. Uploading to Backblaze B2...');
    const uploadCommand = new PutObjectCommand({
      Bucket: config.bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
    });
    
    const result = await s3Client.send(uploadCommand);
    console.log('✅ Upload successful!');
    console.log('Response:', {
      ETag: result.ETag,
      VersionId: result.VersionId,
    });
    console.log('');
    
    console.log('🎉 Photo upload test completed successfully!');
    console.log(`📸 Your photo should now be accessible at:`);
    console.log(`    https://${config.bucket}.s3.${config.region}.backblazeb2.com/${s3Key}`);
    
  } catch (error) {
    console.error('❌ Upload test failed:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('   → Photo file not found. Check the path.');
    } else if (error.name === 'NoSuchBucket') {
      console.error('   → Bucket not found. Check bucket name and region.');
    } else if (error.$metadata?.httpStatusCode === 403) {
      console.error('   → Permission denied. Check your application key permissions.');
    }
  }
}

testPhotoUpload();
