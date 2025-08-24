const { PrismaClient } = require('@prisma/client');

async function checkVideoThumbnails() {
  const prisma = new PrismaClient();
  
  try {
    const thumbnails = await prisma.videoThumbnail.findMany();
    console.log(`Video thumbnails in database: ${thumbnails.length}`);
    
    thumbnails.forEach(t => {
      console.log(`- Video ${t.videoId}: ${t.size} (${t.width}x${t.height}) - ${t.s3Key}`);
    });
    
    if (thumbnails.length === 0) {
      console.log('No video thumbnails found. They may not have been generated yet.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVideoThumbnails();
