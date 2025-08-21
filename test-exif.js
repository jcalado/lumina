const exifr = require('exifr');
const path = require('path');

async function testOrientation() {
  try {
    // Let's test with one of the photos directly
    const photoPath = 'C:\\fotos\\ACNAC\\2023\\Exploradores\\01 - Domingo\\IMG_0703.jpg';
    
    console.log('Testing EXIF extraction on:', photoPath);
    
    // Get all EXIF data first
    const allExif = await exifr.parse(photoPath);
    console.log('\nAll EXIF data available:');
    console.log(JSON.stringify(allExif, null, 2));
    
    // Test with specific orientation extraction
    const orientationData = await exifr.parse(photoPath, {
      pick: ['Orientation', 'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight']
    });
    
    console.log('\nOrientation-specific data:');
    console.log(JSON.stringify(orientationData, null, 2));
    
  } catch (error) {
    console.error('Error testing EXIF:', error);
  }
}

testOrientation();
