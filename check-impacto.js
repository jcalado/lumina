const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkImpactoAlbum() {
  try {
    const impactoAlbum = await prisma.album.findUnique({
      where: { slug: 'impacto' }
    });
    
    console.log('Impacto album:', JSON.stringify(impactoAlbum, null, 2));
    
    if (impactoAlbum) {
      const subAlbums = await prisma.album.findMany({
        where: {
          path: { startsWith: impactoAlbum.path + '/' },
          status: 'PUBLIC',
          enabled: true
        }
      });
      
      console.log('Sub-albums count:', subAlbums.length);
      console.log('Sub-albums:', subAlbums.map(sa => ({ path: sa.path, name: sa.name })));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkImpactoAlbum();
