import { PrismaClient } from '@prisma/client';
import { generateUniqueSlug } from '../lib/slugs';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating test albums with different slug scenarios...');

  const testAlbums = [
    { name: 'My Summer Vacation 2023', path: 'summer-vacation-2023' },
    { name: 'Christmas Photos', path: 'christmas-photos' },
    { name: 'Wedding @ Beach Resort', path: 'wedding-beach-resort' },
    { name: 'Family Trip to Paris!', path: 'family-trip-paris' },
    { name: 'Sample Album', path: 'duplicate-sample-album' }, // This should get a -1 suffix
  ];

  for (const albumData of testAlbums) {
    try {
      const slug = await generateUniqueSlug(albumData.name);
      
      await prisma.$executeRaw`
        INSERT INTO albums (id, path, slug, name, description, status, enabled, syncedToS3, localFilesSafeDelete, createdAt, updatedAt)
        VALUES (
          UUID(),
          ${albumData.path},
          ${slug},
          ${albumData.name},
          'Test album created to demonstrate slug functionality.',
          'PUBLIC',
          1,
          0,
          0,
          NOW(),
          NOW()
        )
      `;

      console.log(`Created album "${albumData.name}" with slug "${slug}"`);
    } catch (error) {
      console.error(`Failed to create album "${albumData.name}":`, error);
    }
  }

  console.log('Test albums created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
