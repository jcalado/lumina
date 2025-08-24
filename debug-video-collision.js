const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVideos() {
  const videos = await prisma.video.findMany({
    where: {
      id: { in: ['cmepkhes3001uiwsc6sle1fcj', 'cmepkhd0u001siwsculareg01'] }
    },
    include: {
      album: true,
      thumbnails: true
    }
  });

  console.log('Found', videos.length, 'videos:');
  videos.forEach(video => {
    console.log('Video ID:', video.id);
    console.log('Filename:', video.filename);
    console.log('Original Path:', video.originalPath);
    console.log('S3 Key:', video.s3Key);
    console.log('Album:', video.album.path);
    console.log('Thumbnails:', video.thumbnails.length);
    video.thumbnails.forEach(thumb => {
      console.log('  -', thumb.size + ':', thumb.s3Key);
    });
    console.log('---');
  });

  await prisma.$disconnect();
}

checkVideos().catch(console.error);
