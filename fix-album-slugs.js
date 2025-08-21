const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

async function fixAlbumSlugs() {
  try {
    console.log('Fixing album slugs...');
    
    // Get all albums
    const albums = await prisma.album.findMany({
      select: {
        id: true,
        name: true,
        path: true,
        slug: true
      }
    });
    
    console.log(`Found ${albums.length} albums`);
    
    for (const album of albums) {
      let newSlug = generateSlug(album.name);
      
      // Check if this slug already exists for albums at the same level
      const pathParts = album.path.split('/');
      const parentPath = pathParts.slice(0, -1).join('/');
      
      const existingSlug = await prisma.album.findFirst({
        where: {
          slug: newSlug,
          path: {
            startsWith: parentPath ? parentPath + '/' : '',
            not: album.path
          }
        }
      });
      
      if (existingSlug) {
        // Add a number suffix if slug already exists at this level
        let counter = 2;
        while (true) {
          const testSlug = `${newSlug}-${counter}`;
          const existing = await prisma.album.findFirst({
            where: {
              slug: testSlug,
              path: {
                startsWith: parentPath ? parentPath + '/' : ''
              }
            }
          });
          if (!existing) {
            newSlug = testSlug;
            break;
          }
          counter++;
        }
      }
      
      if (album.slug !== newSlug) {
        console.log(`Updating ${album.name}: "${album.slug}" -> "${newSlug}"`);
        await prisma.album.update({
          where: { id: album.id },
          data: { slug: newSlug }
        });
      } else {
        console.log(`${album.name}: slug "${album.slug}" is already correct`);
      }
    }
    
    console.log('✅ Slug fixing completed!');
  } catch (error) {
    console.error('❌ Error fixing slugs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAlbumSlugs();
