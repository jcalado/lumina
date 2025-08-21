const { generateThumbnails } = require('./lib/thumbnails.ts');

async function testOrientationThumbnails() {
  console.log('Testing thumbnail generation with orientation correction...');
  
  // Test with a photo that has orientation data
  const testPhoto = {
    photoId: 'test-photo-id',
    originalPath: 'C:\\fotos\\ACNAC\\2023\\Exploradores\\01 - Domingo\\IMG_0703.jpg',
    s3Key: 'test-s3-key',
    albumPath: 'ACNAC/2023/Exploradores/01 - Domingo',
    filename: 'IMG_0703.jpg',
    orientation: 6 // Rotate 90° CW
  };
  
  try {
    console.log('Generating thumbnails with orientation correction...');
    const result = await generateThumbnails(testPhoto);
    console.log('✅ Thumbnail generation completed:', result);
  } catch (error) {
    console.error('❌ Thumbnail generation failed:', error);
  }
}

testOrientationThumbnails();
