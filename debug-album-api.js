const { PrismaClient } = require('@prisma/client');

async function debugAlbumAPI() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing database connection...');
    
    // Check if we can connect to the database
    await prisma.$connect();
    console.log('✓ Database connection successful');
    
    // List all albums
    console.log('\nFetching all albums...');
    const albums = await prisma.album.findMany({
      select: {
        id: true,
        path: true,
        name: true,
        status: true,
        enabled: true,
        _count: {
          select: {
            photos: true,
          },
        },
      },
      take: 10, // Limit to first 10 albums
    });
    
    console.log(`Found ${albums.length} albums:`);
    albums.forEach((album, index) => {
      console.log(`${index + 1}. "${album.name}" (path: "${album.path}", status: ${album.status}, enabled: ${album.enabled}, photos: ${album._count.photos})`);
    });
    
    // Test fetching a specific album
    if (albums.length > 0) {
      const testAlbum = albums[0];
      console.log(`\nTesting fetch for album: "${testAlbum.path}"`);
      
      const detailedAlbum = await prisma.album.findUnique({
        where: {
          path: testAlbum.path,
        },
        include: {
          photos: {
            include: {
              thumbnails: true,
            },
            orderBy: {
              takenAt: 'asc',
            },
            take: 5, // Limit photos for testing
          },
        },
      });
      
      if (detailedAlbum) {
        console.log(`✓ Successfully fetched album details`);
        console.log(`  - Photos: ${detailedAlbum.photos.length}`);
        console.log(`  - First photo filename: ${detailedAlbum.photos[0]?.filename || 'No photos'}`);
      } else {
        console.log(`✗ Failed to fetch album details`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
    console.error('Error details:');
    console.error('- Message:', error.message);
    console.error('- Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugAlbumAPI().catch(console.error);
