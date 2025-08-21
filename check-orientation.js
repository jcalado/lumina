const { PrismaClient } = require('@prisma/client');

async function checkOrientation() {
  const prisma = new PrismaClient();
  
  try {
    // Get a few photos with metadata
    const photos = await prisma.photo.findMany({
      where: {
        metadata: {
          not: null
        }
      },
      take: 10,
      select: {
        id: true,
        filename: true,
        metadata: true
      }
    });

    console.log(`Found ${photos.length} photos with metadata:`);
    
    for (const photo of photos) {
      console.log(`\nPhoto: ${photo.filename}`);
      console.log(`ID: ${photo.id}`);
      
      if (photo.metadata) {
        const metadata = typeof photo.metadata === 'string' 
          ? JSON.parse(photo.metadata) 
          : photo.metadata;
        
        console.log(`Raw metadata:`, JSON.stringify(metadata, null, 2));
        console.log(`Orientation: ${metadata.orientation || metadata.Orientation || 'not set'}`);
        console.log(`Dimensions: ${metadata.ImageWidth}x${metadata.ImageHeight}`);
        console.log(`Camera: ${metadata.Make} ${metadata.Model || ''}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrientation();
