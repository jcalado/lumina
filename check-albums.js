const { PrismaClient } = require('@prisma/client');

async function checkAlbums() {
  const prisma = new PrismaClient();
  
  try {
    const albums = await prisma.album.findMany({
      select: {
        id: true,
        path: true,
        name: true
      }
    });
    
    console.log('Albums:');
    albums.forEach(album => {
      console.log(`- Path: "${album.path}"`);
      console.log(`  Name: "${album.name}"`);
      console.log(`  ID: ${album.id}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAlbums();
