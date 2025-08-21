const { PrismaClient } = require('@prisma/client');
const { generateThumbnails } = require('./lib/thumbnails.ts');

async function testRegenerateSingleThumbnail() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing thumbnail regeneration for single photo...');
    
    // Get a specific photo by ID
    const photoId = 'cmeli7vcd00vdiw7kb4ueoici'; // The photo you mentioned
    
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        album: true,
        thumbnails: true,
      },
    });
    
    if (!photo) {
      console.log('Photo not found');
      return;
    }
    
    console.log(`Found photo: ${photo.filename}`);
    console.log(`Album path: ${photo.album.path}`);
    console.log(`Existing thumbnails: ${photo.thumbnails.length}`);
    
    // Parse metadata to get orientation
    let orientation = 1;
    if (photo.metadata) {
      try {
        const metadata = typeof photo.metadata === 'string' 
          ? JSON.parse(photo.metadata) 
          : photo.metadata;
        orientation = metadata.orientation || 1;
        console.log(`EXIF Orientation: ${orientation}`);
      } catch (error) {
        console.log('Could not parse metadata for orientation');
      }
    }
    
    // Delete existing thumbnails first
    console.log('Deleting existing thumbnails...');
    await prisma.thumbnail.deleteMany({
      where: { photoId: photo.id }
    });
    
    // Regenerate thumbnails with proper orientation
    console.log('Regenerating thumbnails with orientation correction...');
    const result = await generateThumbnails({
      photoId: photo.id,
      originalPath: photo.originalPath,
      s3Key: photo.s3Key,
      albumPath: photo.album.path,
      filename: photo.filename,
      orientation: orientation,
    });
    
    console.log('✅ Thumbnail regeneration completed:', result);
    
    // Check new thumbnails
    const newThumbnails = await prisma.thumbnail.findMany({
      where: { photoId: photo.id }
    });
    
    console.log(`New thumbnails created: ${newThumbnails.length}`);
    newThumbnails.forEach(thumb => {
      console.log(`- ${thumb.size}: ${thumb.s3Key} (${thumb.width}x${thumb.height})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testRegenerateSingleThumbnail();
