import { PrismaClient } from '@prisma/client';
import { generateUniqueSlug } from '../lib/slugs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create default site settings if they don't exist
  const settingsCount = await prisma.siteSettings.count();
  
  if (settingsCount === 0) {
    console.log('Creating default site settings...');
    
    await prisma.siteSettings.create({
      data: {
        key: 'siteName',
        value: 'Lumina Gallery',
      },
    });
    
    console.log('Default site settings created.');
  }
  
  // Create some sample albums if none exist
  const albumCount = await prisma.album.count();
  
  if (albumCount === 0) {
    console.log('Creating sample album...');
    
    await prisma.album.create({
      data: {
        path: 'sample-album',
        slug: await generateUniqueSlug('Sample Album', ''),
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
