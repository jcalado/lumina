import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Load environment variables
dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

async function listBucketContents() {
  try {
    console.log('📦 Checking Backblaze B2 Bucket Contents');
    console.log('========================================');
    
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log('🏗️ Bucket is empty');
      return;
    }
    
    console.log(`Found ${response.Contents.length} object(s):`);
    console.log('');
    
    response.Contents.forEach((obj, index) => {
      console.log(`${index + 1}. ${obj.Key}`);
      console.log(`   Size: ${Math.round((obj.Size || 0) / 1024)}KB`);
      console.log(`   Modified: ${obj.LastModified}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error listing bucket contents:', error.message);
  }
}

listBucketContents();
