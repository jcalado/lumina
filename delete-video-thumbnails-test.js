const { PrismaClient } = require('@prisma/client');

async function deleteVideoThumbnailsForTesting() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Deleting one video thumbnail for testing...');
    
    // Delete thumbnails for the first video
    const video = await prisma.video.findFirst();
    if (video) {
      const deletedThumbnails = await prisma.videoThumbnail.deleteMany({
        where: { videoId: video.id }
      });
      
      console.log(`Deleted ${deletedThumbnails.count} thumbnails for video: ${video.filename}`);
      console.log('Now you can test the video thumbnail generation!');
    } else {
      console.log('No videos found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteVideoThumbnailsForTesting();
