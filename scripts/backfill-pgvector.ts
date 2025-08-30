#!/usr/bin/env ts-node
/*
  Backfill script to populate faces.embedding_vec from JSON embeddings
  - Normalizes vectors
  - Processes in batches
*/
import { prisma } from '@/lib/prisma';
import { normalizeVector, toPgvectorLiteral } from '@/lib/vector-utils';

async function main() {
  const batchSize = Number(process.env.BACKFILL_BATCH || 500);
  let processed = 0;
  // Find faces that have JSON embedding but null embedding_vec
  // Note: Prisma doesn't support pgvector type; we test for null via raw SQL
  // and update via $executeRaw.
  // Loop until none remain or safety cap
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ id: string; embedding: string }>>`
      SELECT id, embedding
      FROM faces
      WHERE embedding IS NOT NULL AND (embedding_vec IS NULL)
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) break;

    for (const r of rows) {
      try {
        const arr = JSON.parse(r.embedding || '[]');
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const vec = normalizeVector(arr.map((n: any) => Number(n)));
        const lit = toPgvectorLiteral(vec);
        await prisma.$executeRawUnsafe(
          `UPDATE faces SET embedding_vec = $1::vector WHERE id = $2`,
          lit,
          r.id,
        );
        processed++;
      } catch (e) {
        // skip bad rows
      }
    }
    if (rows.length < batchSize) break;
  }
  console.log(`Backfill complete. Updated ${processed} faces.`);
}

main().then(() => prisma.$disconnect());

