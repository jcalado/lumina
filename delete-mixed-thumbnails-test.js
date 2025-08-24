const { PrismaClient } = require('@prisma/client');

async function deleteMixedThumbnailsForTesting() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Deleting some photo and video thumbnails for testing...');
    
    // Delete thumbnails for the first photo
    const photo = await prisma.photo.findFirst();
    if (photo) {
      const deletedPhotoThumbnails = await prisma.thumbnail.deleteMany({
        where: { photoId: photo.id }
      });
      console.log(`Deleted ${deletedPhotoThumbnails.count} photo thumbnails for: ${photo.filename}`);
    }
    
    // Delete thumbnails for the first video
    const video = await prisma.video.findFirst();
    if (video) {
      const deletedVideoThumbnails = await prisma.videoThumbnail.deleteMany({
        where: { videoId: video.id }
      });
      console.log(`Deleted ${deletedVideoThumbnails.count} video thumbnails for: ${video.filename}`);
    }
    
    console.log('Now you can test the combined thumbnail generation!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteMixedThumbnailsForTesting();
