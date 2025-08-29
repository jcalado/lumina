import { prisma } from '../lib/prisma';

type Mode = 'flag' | 'null' | 'repair' | 'delete';

interface Options {
  mode: Mode;
  limit?: number;
  dryRun?: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { mode: 'flag' } as any;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--mode=')) {
      const v = arg.split('=')[1] as Mode;
      if (v === 'flag' || v === 'null' || v === 'repair' || v === 'delete') opts.mode = v;
    } else if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) opts.limit = n;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    }
  }
  return opts;
}

function tryNormalizeEmbedding(json: string): { ok: true; data: number[] } | { ok: false; reason: string } {
  try {
    const parsed: any = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return { ok: false, reason: 'invalid_shape' };
    }
    // Coerce values to numbers when possible
    const nums = parsed.map((v) => Number(v));
    if (nums.some((n) => !Number.isFinite(n))) {
      return { ok: false, reason: 'non_numeric_values' };
    }
    return { ok: true, data: nums };
  } catch (e) {
    return { ok: false, reason: 'invalid_json' };
  }
}

async function main() {
  const { mode, limit, dryRun } = parseArgs(process.argv);
  console.log(`Scanning faces.embedding with mode=${mode}${dryRun ? ' (dry-run)' : ''}${limit ? `, limit=${limit}` : ''}`);

  let scanned = 0;
  let valid = 0;
  let invalidUtf8 = 0; // rows that throw when reading embedding
  let invalidJson = 0;
  let invalidShape = 0; // not array or contains non-numeric values
  let repaired = 0;
  let flagged = 0;
  let nulled = 0;
  let deleted = 0;

  try {
    // Fetch candidate IDs only to avoid triggering string conversion on bulk select
    const candidates = await prisma.face.findMany({
      where: {
        OR: [
          { hasEmbedding: true },
          { embedding: { not: null } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    console.log(`Found ${candidates.length} candidate faces`);

    for (const c of candidates) {
      scanned++;
      let raw: string | null = null;
      let readError = false;
      try {
        const row = await prisma.face.findUnique({ where: { id: c.id }, select: { embedding: true } });
        raw = (row?.embedding ?? null) as string | null;
      } catch (e) {
        // NAPI string conversion error or other driver issue when reading this row
        readError = true;
      }

      if (readError) {
        invalidUtf8++;
        if (!dryRun) {
          if (mode === 'delete') {
            await prisma.face.delete({ where: { id: c.id } });
            deleted++;
          } else if (mode === 'null') {
            await prisma.face.update({ where: { id: c.id }, data: { embedding: null, hasEmbedding: false } });
            nulled++;
          } else if (mode === 'flag' || mode === 'repair') {
            await prisma.face.update({ where: { id: c.id }, data: { hasEmbedding: false } });
            flagged++;
          }
        }
        continue;
      }

      if (raw == null) {
        // nothing to do
        valid++;
        continue;
      }

      const normalized = tryNormalizeEmbedding(raw);
      if (normalized.ok) {
        // Embedding is valid/repairable; if mode is repair, re-save normalized numbers
        valid++;
        if (!dryRun && mode === 'repair') {
          await prisma.face.update({
            where: { id: c.id },
            data: {
              embedding: JSON.stringify(normalized.data),
              hasEmbedding: normalized.data.length > 0,
            },
          });
          repaired++;
        }
      } else {
        // Broken JSON or shape
        if (normalized.reason === 'invalid_json') invalidJson++; else invalidShape++;

        if (!dryRun) {
          if (mode === 'delete') {
            await prisma.face.delete({ where: { id: c.id } });
            deleted++;
          } else if (mode === 'null') {
            await prisma.face.update({ where: { id: c.id }, data: { embedding: null, hasEmbedding: false } });
            nulled++;
          } else if (mode === 'repair') {
            // Not repairable; fall back to flagging
            await prisma.face.update({ where: { id: c.id }, data: { hasEmbedding: false } });
            flagged++;
          } else if (mode === 'flag') {
            await prisma.face.update({ where: { id: c.id }, data: { hasEmbedding: false } });
            flagged++;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during scan:', error);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nScan Summary:');
  console.log(`  scanned:           ${scanned}`);
  console.log(`  valid:             ${valid}`);
  console.log(`  invalidUtf8:       ${invalidUtf8}`);
  console.log(`  invalidJson:       ${invalidJson}`);
  console.log(`  invalidShape:      ${invalidShape}`);
  console.log(`  repaired:          ${repaired}`);
  console.log(`  flagged(hasEmb=0): ${flagged}`);
  console.log(`  nulled(emb=NULL):  ${nulled}`);
  console.log(`  deleted(rows):     ${deleted}`);
}

main();

