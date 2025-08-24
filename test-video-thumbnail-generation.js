import { PrismaClient } from '@prisma/client';

async function testVideoThumbnailGeneration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing video thumbnail generation...');
    
    // Get the first video without thumbnails
    const video = await prisma.video.findFirst({
      where: {
        thumbnails: {
          none: {},
        },
      },
      include: {
        album: {
          select: {
            path: true,
          },
        },
      },
    });
    
    if (!video) {
      console.log('No videos found that need thumbnails');
      return;
    }
    
    console.log(`Found video: ${video.filename}`);
    console.log(`Video path: ${video.originalPath}`);
    console.log(`S3 key: ${video.s3Key}`);
    console.log(`Album path: ${video.album.path}`);
    
    // Import the video thumbnail generation function
    const { generateVideoThumbnails } = await import('./lib/video-thumbnails');
    
    // Generate thumbnails
    console.log('Generating video thumbnails...');
    const result = await generateVideoThumbnails({
      videoId: video.id,
      originalPath: video.originalPath,
      s3Key: video.s3Key,
      albumPath: video.album.path,
      filename: video.filename,
    });
    
    console.log(`✅ Video thumbnail generation completed!`);
    console.log(`Thumbnails created: ${result.thumbnailsCreated}`);
    
    // Check the created thumbnails in the database
    const thumbnails = await prisma.videoThumbnail.findMany({
      where: { videoId: video.id }
    });
    
    console.log(`Database now has ${thumbnails.length} thumbnails for this video:`);
    thumbnails.forEach(thumb => {
      console.log(`- ${thumb.size}: ${thumb.s3Key} (${thumb.width}x${thumb.height})`);
    });
    
  } catch (error) {
    console.error('❌ Error testing video thumbnail generation:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testVideoThumbnailGeneration();
