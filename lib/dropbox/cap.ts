import { prisma } from '@/lib/prisma';

/**
 * Atomically reserve `n` upload slots on a dropbox, honoring maxUploads.
 * Returns true if reserved. Safe under concurrent confirms (single UPDATE).
 */
export async function tryReserveCap(dropboxId: string, n: number): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "dropboxes"
    SET "acceptedCount" = "acceptedCount" + ${n}
    WHERE "id" = ${dropboxId}
      AND ("maxUploads" IS NULL OR "acceptedCount" + ${n} <= "maxUploads")
  `;
  return updated === 1;
}
