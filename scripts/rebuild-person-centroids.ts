import { prisma } from '../lib/prisma';
import { rebuildAllPersonCentroids } from '../lib/people';

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }
  return { limit, dryRun };
}

async function main() {
  const { limit, dryRun } = parseArgs(process.argv);
  console.log('[centroids:rebuild] start', { limit, dryRun });
  if (dryRun) {
    const count = await prisma.person.count();
    console.log(`[centroids:rebuild] would rebuild up to ${limit ?? count} of ${count} persons`);
  } else {
    const { updated } = await rebuildAllPersonCentroids(limit);
    console.log('[centroids:rebuild] done', { updated });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

