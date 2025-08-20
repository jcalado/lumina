const { PrismaClient } = require('@prisma/client');

async function debugThumbnails() {
  const prisma = new PrismaClient();
  
  try {
    const photos = await prisma.photo.findMany({
      include: {
        thumbnails: true
      }
    });
    
    console.log('Photos with thumbnails:');
    photos.forEach(photo => {
      console.log(`\nPhoto: ${photo.filename}`);
      console.log(`Original s3Key: ${photo.s3Key}`);
      photo.thumbnails.forEach(thumb => {
        console.log(`  ${thumb.size}: ${thumb.s3Key}`);
      });
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugThumbnails();
