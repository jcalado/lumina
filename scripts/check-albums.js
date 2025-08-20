const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAlbums() {
  try {
    const albums = await prisma.album.findMany({
      select: {
        id: true,
        path: true,
        name: true,
        status: true,
        enabled: true,
        _count: {
          select: {
            photos: true
          }
        }
      },
      orderBy: { path: 'asc' }
    });
    
    console.log('All albums:');
    albums.forEach(album => {
      console.log(`- ${album.path} (${album.name}) - ${album._count.photos} photos - Status: ${album.status}, Enabled: ${album.enabled}`);
    });
    
    // Check for the "acampamentos" album specifically
    const acampamentos = albums.find(a => a.path === 'acampamentos');
    if (acampamentos) {
      console.log('\nFound acampamentos album:', acampamentos);
      
      // Check for sub-albums
      const subAlbums = albums.filter(a => a.path.startsWith('acampamentos/'));
      console.log('Sub-albums of acampamentos:', subAlbums);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAlbums();
