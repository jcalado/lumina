const { PrismaClient } = require('@prisma/client');

async function getVideoId() {
  const prisma = new PrismaClient();
  
  try {
    const video = await prisma.video.findFirst({
      select: { id: true, filename: true }
    });
    
    if (video) {
      console.log('Video ID:', video.id);
      console.log('Filename:', video.filename);
    } else {
      console.log('No videos found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getVideoId();
