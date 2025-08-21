import { PrismaClient } from '@prisma/client';
import { generateSlug } from '../lib/slugs';

const prisma = new PrismaClient();

async function main() {
  console.log('Populating slugs for all albums...');

  // Get all albums
  const albums = await prisma.album.findMany();

  console.log(`Found ${albums.length} albums`);

  // Generate slugs for all albums
  for (const album of albums) {
    let baseSlug = generateSlug(album.name);
    let slug = baseSlug;
    let counter = 1;

    // Ensure uniqueness by checking against our generated slugs
    const usedSlugs = new Set<string>();
    
    // Simple check - if this is a duplicate base slug, add counter
    let attempts = 0;
    while (attempts < 100) { // Safety limit
      try {
        // Try to update with this slug
        await prisma.$executeRaw`UPDATE albums SET slug = ${slug} WHERE id = ${album.id}`;
        console.log(`Generated slug "${slug}" for album "${album.name}"`);
        break;
      } catch (error) {
        // If unique constraint error, try next slug
        slug = `${baseSlug}-${counter}`;
        counter++;
        attempts++;
      }
    }
    
    if (attempts >= 100) {
      console.error(`Failed to generate unique slug for album "${album.name}"`);
    }
  }

  console.log('Migration completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
