import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create some sample albums if none exist
  const albumCount = await prisma.album.count();
  
  if (albumCount === 0) {
    console.log('Creating sample album...');
    
    await prisma.album.create({
      data: {
        path: 'sample-album',
        name: 'Sample Album',
        description: 'This is a sample album to demonstrate the photo gallery functionality.',
        status: 'PUBLIC',
        enabled: true,
      },
    });
    
    console.log('Sample album created.');
  }
  
  console.log('Database seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
