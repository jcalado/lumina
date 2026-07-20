#!/usr/bin/env tsx
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma-client';
import { getS3Service } from '../lib/s3';

const DAYS = Number(process.env.DROPBOX_STAGING_TTL_DAYS || 7);

async function main() {
  const prisma = createPrismaClient();
  const s3 = getS3Service();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  // Still-pending files older than the cutoff = abandoned uploads.
  const stale = await prisma.dropboxFile.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, s3Key: true },
  });
  console.log(`Found ${stale.length} abandoned staging file(s) older than ${DAYS} days`);
  for (const f of stale) {
    await s3.deleteObject(f.s3Key).catch(() => {});
    await prisma.dropboxFile.delete({ where: { id: f.id } });
  }
  await prisma.$disconnect();
  console.log('Cleanup complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
