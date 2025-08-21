const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSlugConversion() {
  try {
    // Get a few albums to test with
    const albums = await prisma.album.findMany({
      select: {
        path: true,
        slug: true,
        name: true
      },
      take: 5
    });

    console.log('Albums in database:');
    albums.forEach(album => {
      console.log(`  Path: "${album.path}" | Slug: "${album.slug}" | Name: "${album.name}"`);
    });

    // Test conversion from path to slug path
    for (const album of albums) {
      if (album.slug) {
        console.log(`\nTesting conversion for: ${album.path}`);
        
        // Try to convert slug back to path
        const { slugPathToPath } = await import('./lib/slug-paths.js');
        const convertedPath = await slugPathToPath(album.slug);
        
        console.log(`  Slug: ${album.slug}`);
        console.log(`  Converted back to path: ${convertedPath}`);
        console.log(`  Match: ${convertedPath === album.path ? 'YES' : 'NO'}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSlugConversion();
