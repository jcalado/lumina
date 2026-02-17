import { PrismaClient } from '@prisma/client';
import { generateSlug, getParentPath } from '../lib/slugs';

const prisma = new PrismaClient();

async function main() {
  console.log('Populating slugs for all albums (parent-scoped)...');

  const albums = await prisma.album.findMany();
  console.log(`Found ${albums.length} albums`);

  // Group albums by parent path
  const byParent = new Map<string, typeof albums>();
  for (const album of albums) {
    const pp = getParentPath(album.path);
    if (!byParent.has(pp)) byParent.set(pp, []);
    byParent.get(pp)!.push(album);
  }

  let updated = 0;

  for (const [parentPath, siblings] of byParent) {
    const usedSlugs = new Set<string>();

    for (const album of siblings) {
      const baseSlug = generateSlug(album.name);
      let slug = baseSlug;
      let counter = 1;

      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      usedSlugs.add(slug);

      if (album.slug !== slug) {
        await prisma.$executeRaw`UPDATE albums SET slug = ${slug} WHERE id = ${album.id}`;
        console.log(`[${parentPath || 'root'}] "${album.name}" slug: "${album.slug}" -> "${slug}"`);
        updated++;
      } else {
        console.log(`[${parentPath || 'root'}] "${album.name}" slug: "${slug}" (unchanged)`);
      }
    }
  }

  console.log(`\nMigration completed! Updated ${updated} album(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
