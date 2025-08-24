const { PrismaClient } = require('@prisma/client');

async function deleteAllVideoThumbnails() {
  const prisma = new PrismaClient();
  
  try {
    const result = await prisma.videoThumbnail.deleteMany();
    console.log(`Deleted ${result.count} video thumbnails`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllVideoThumbnails();
