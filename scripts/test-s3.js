import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Load environment variables
dotenv.config();

console.log('🔧 Backblaze B2 S3-Compatible API Test');
console.log('=====================================');

const config = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  accessKey: process.env.S3_ACCESS_KEY,
  secretKey: process.env.S3_SECRET_KEY,
};

console.log('Configuration:');
console.log(`- Endpoint: ${config.endpoint}`);
console.log(`- Region: ${config.region}`);
console.log(`- Bucket: ${config.bucket}`);
console.log(`- Access Key: ${config.accessKey?.substring(0, 8)}...`);
console.log(`- Secret Key: ${config.secretKey ? '***configured***' : 'NOT SET'}`);
console.log('');

const s3Client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  credentials: {
    accessKeyId: config.accessKey || '',
    secretAccessKey: config.secretKey || '',
  },
  forcePathStyle: true, // Required for Backblaze B2
});

async function testS3Connection() {
  try {
    console.log('1. Testing bucket access...');
    const listCommand = new ListObjectsV2Command({
      Bucket: config.bucket,
      MaxKeys: 5, // Just get a few objects
    });
    
    const listResponse = await s3Client.send(listCommand);
    console.log(`✅ Bucket accessible. Found ${listResponse.Contents?.length || 0} objects (showing max 5).`);
    
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      console.log('   Sample objects:');
      listResponse.Contents.slice(0, 3).forEach(obj => {
        console.log(`   - ${obj.Key} (${obj.Size} bytes)`);
      });
    }
    console.log('');
    
    console.log('2. Testing file upload...');
    const testContent = Buffer.from(`Lumina Gallery test - ${new Date().toISOString()}`, 'utf-8');
    const testKey = `test/lumina-connection-test-${Date.now()}.txt`;
    
    const uploadCommand = new PutObjectCommand({
      Bucket: config.bucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    });
    
    await s3Client.send(uploadCommand);
    console.log(`✅ Upload successful. Key: ${testKey}`);
    console.log('');
    
    console.log('3. Testing file download...');
    const downloadCommand = new GetObjectCommand({
      Bucket: config.bucket,
      Key: testKey,
    });
    
    const downloadResponse = await s3Client.send(downloadCommand);
    const downloadedContent = await downloadResponse.Body?.transformToString();
    console.log(`✅ Download successful. Content: "${downloadedContent}"`);
    console.log('');
    
    console.log('4. Testing signed URL generation...');
    const signedUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 300 });
    console.log(`✅ Signed URL generated: ${signedUrl.substring(0, 100)}...`);
    console.log('');
    
    console.log('5. Cleaning up test file...');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: testKey,
    });
    
    await s3Client.send(deleteCommand);
    console.log('✅ Test file deleted.');
    console.log('');
    
    console.log('🎉 All Backblaze B2 tests passed! Your configuration is working correctly.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Make sure you have photos in C:\\fotos\\');
    console.log('2. Visit http://localhost:3000 and click "Sync Photos"');
    console.log('3. Photos will be uploaded to your Backblaze B2 bucket');
    
  } catch (error) {
    console.error('❌ S3 test failed:', error.message);
    console.error('');
    console.error('Common issues:');
    console.error('- Check if your Backblaze B2 application key has read/write permissions');
    console.error('- Verify the endpoint URL is correct for your region');
    console.error('- Make sure the bucket name exists and is accessible');
    console.error('- Check if your application key is active (not expired)');
    
    if (error.name === 'CredentialsProviderError') {
      console.error('- Your credentials might be invalid');
    }
    
    if (error.$metadata?.httpStatusCode === 403) {
      console.error('- Permission denied. Check your application key permissions');
    }
    
    if (error.$metadata?.httpStatusCode === 404) {
      console.error('- Bucket not found. Check bucket name and region');
    }
  }
}

testS3Connection();
