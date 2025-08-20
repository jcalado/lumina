const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPhoto() {
  try {
    const photo = await prisma.photo.findUnique({
      where: { id: 'cmek13m820004iwk8n25saj78' },
      select: {
        id: true,
        filename: true,
        s3Key: true,
        fileSize: true,
        thumbnails: {
          select: {
            size: true,
            s3Key: true,
          }
        }
      }
    });
    
    console.log('Photo details:', JSON.stringify(photo, null, 2));
    
    // Also check all photos and their thumbnails
    const allPhotos = await prisma.photo.findMany({
      select: {
        id: true,
        filename: true,
        s3Key: true,
        thumbnails: {
          select: {
            size: true,
            s3Key: true,
          }
        }
      }
    });
    
    console.log('\nAll photos and thumbnails:');
    allPhotos.forEach(photo => {
      console.log(`- ${photo.filename} (${photo.id})`);
      console.log(`  Original S3 Key: ${photo.s3Key}`);
      console.log(`  Thumbnails: ${photo.thumbnails.length}`);
      photo.thumbnails.forEach(thumb => {
        console.log(`    ${thumb.size}: ${thumb.s3Key}`);
      });
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPhoto();
