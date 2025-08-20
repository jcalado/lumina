const { S3Service } = require('../lib/s3.ts');

async function testPhotoAccess() {
  try {
    const s3Service = new S3Service();
    const s3Key = "photos/Acampamentos/Inter Regional - Norte e Centro/InterRegional.jpg";
    
    console.log('Testing S3 access for key:', s3Key);
    
    // Try to get a signed URL for the original photo
    const signedUrl = await s3Service.getSignedUrl(s3Key, 300); // 5 minutes
    console.log('Signed URL generated successfully:', signedUrl);
    
    // Test if the URL is accessible
    const response = await fetch(signedUrl, { method: 'HEAD' });
    console.log('HEAD request status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content-Length:', response.headers.get('content-length'));
    
  } catch (error) {
    console.error('Error testing S3 access:', error);
  }
}

testPhotoAccess();
