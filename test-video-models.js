import { PrismaClient } from '@prisma/client';

async function testVideoModels() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing video models...');
    
    // Test video count
    const videoCount = await prisma.video.count();
    console.log(`Found ${videoCount} videos in database`);
    
    // Test finding videos without thumbnails
    const videosWithoutThumbnails = await prisma.video.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        album: {
          select: {
            path: true,
          },
        },
      },
    });
    
    console.log(`Found ${videosWithoutThumbnails.length} videos without thumbnails:`);
    videosWithoutThumbnails.forEach(video => {
      console.log(`- ${video.filename}`);
    });
    
    // Test video thumbnail model
    const thumbnailCount = await prisma.videoThumbnail.count();
    console.log(`Found ${thumbnailCount} video thumbnails in database`);
    
    console.log('✅ All video models work correctly!');
    
  } catch (error) {
    console.error('❌ Error testing video models:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testVideoModels();
