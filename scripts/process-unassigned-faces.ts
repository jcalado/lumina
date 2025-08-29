import { prisma } from '../lib/prisma';

type Mode = 'create_new' | 'assign_existing' | 'both';

interface Options {
  threshold?: number;
  mode: Mode;
  limit: number;
  dryRun?: boolean;
  maxComparisons: number;
  randomize: boolean;
  offset: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { mode: 'both', limit: 500, maxComparisons: 100000, randomize: false, offset: 0 } as any;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--threshold=')) {
      const v = parseFloat(arg.split('=')[1]);
      if (Number.isFinite(v)) opts.threshold = v;
    } else if (arg.startsWith('--mode=')) {
      const v = arg.split('=')[1] as Mode;
      if (v === 'create_new' || v === 'assign_existing' || v === 'both') opts.mode = v;
    } else if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.min(n, 5000);
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('--max-comparisons=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(n) && n > 0) opts.maxComparisons = Math.min(n, 1000000);
    } else if (arg === '--randomize') {
      opts.randomize = true;
    } else if (arg.startsWith('--offset=')) {
      const n = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(n) && n >= 0) opts.offset = n;
    }
  }
  return opts;
}

function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.map((v) => Number(v));
  } catch {}
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb; na += va * va; nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function getSimilarityThresholdFromSettings(): Promise<number> {
  const rows = await prisma.siteSettings.findMany({ where: { key: 'faceRecognitionSimilarityThreshold' } });
  const val = rows[0]?.value;
  const num = parseFloat(val || '0.7');
  return isNaN(num) ? 0.7 : num;
}

async function main() {
  const opts = parseArgs(process.argv);
  const tStart = Date.now();
  let threshold = opts.threshold;
  if (typeof threshold !== 'number') threshold = await getSimilarityThresholdFromSettings();
  if (threshold < 0 || threshold > 1) throw new Error('threshold must be between 0 and 1');

  console.log('[faces:process-unassigned] start', { threshold, mode: opts.mode, limit: opts.limit, maxComparisons: opts.maxComparisons, randomize: opts.randomize, offset: opts.offset, dryRun: !!opts.dryRun });

  // 1) Fetch unassigned faces with embeddings (fast path via raw SQL)
  let unassigned: Array<{ id: string; confidence: number; embedding: string | null }> = [];
  try {
    if (opts.randomize || opts.offset > 0) {
      const order = opts.randomize ? 'random()' : 'confidence DESC';
      const sql = `SELECT id, confidence, embedding FROM "faces" WHERE "personId" IS NULL AND ("ignored" IS NULL OR "ignored" = FALSE) AND "hasEmbedding" = TRUE AND embedding IS NOT NULL ORDER BY ${order} LIMIT ${opts.limit} OFFSET ${opts.offset}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unassigned = await prisma.$queryRawUnsafe<any>(sql);
    } else {
      unassigned = await prisma.$queryRaw<Array<{ id: string; confidence: number; embedding: string | null }>>`
        SELECT id, confidence, embedding
        FROM "faces"
        WHERE "personId" IS NULL
          AND ("ignored" IS NULL OR "ignored" = FALSE)
          AND "hasEmbedding" = TRUE
          AND embedding IS NOT NULL
        ORDER BY confidence DESC
        LIMIT ${opts.limit}
      `;
    }
    console.log('[faces:process-unassigned] fetched', { count: unassigned.length, ms: Date.now() - tStart });
  } catch (e) {
    console.error('[faces:process-unassigned] failed to fetch unassigned faces', e);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  if (unassigned.length === 0) {
    console.log('No unassigned faces to process.');
    await prisma.$disconnect();
    return;
  }

  const faces = unassigned
    .map((r) => ({ id: r.id, confidence: r.confidence, emb: parseEmbedding(r.embedding) }))
    .filter((r): r is { id: string; confidence: number; emb: number[] } => Array.isArray(r.emb) && r.emb.length > 0);
  console.log('[faces:process-unassigned] parsed embeddings', { valid: faces.length, ms: Date.now() - tStart });

  let processed = 0;
  let createdPeople = 0;
  let assignedExisting = 0;

  // 2) Assign to existing people first
  const remaining: Array<{ id: string; confidence: number; emb: number[] }> = [];
  if (opts.mode === 'assign_existing' || opts.mode === 'both') {
    // Prefer centroids; fallback to sample faces
    const centroidRows = await prisma.person.findMany({ select: { id: true, centroidEmbedding: true }, where: { centroidEmbedding: { not: null } } });
    const peopleMap = new Map<string, number[][]>();
    if (centroidRows.length > 0) {
      for (const r of centroidRows) {
        const emb = parseEmbedding(r.centroidEmbedding as any);
        if (emb && emb.length) peopleMap.set(r.id, [emb]);
      }
      console.log('[faces:process-unassigned] loaded centroids', { people: peopleMap.size, ms: Date.now() - tStart });
    } else {
      const joinRows = await prisma.$queryRaw<Array<{ personId: string; faceId: string | null; embedding: string | null }>>`
        SELECT p.id as "personId", f.id as "faceId", f.embedding as embedding
        FROM "people" p
        LEFT JOIN "faces" f
          ON f."personId" = p.id
         AND (f."ignored" IS NULL OR f."ignored" = FALSE)
         AND f."hasEmbedding" = TRUE
         AND f.embedding IS NOT NULL
        ORDER BY p.id
      `;
      for (const r of joinRows) {
        if (!r.personId || !r.faceId || !r.embedding) continue;
        const emb = parseEmbedding(r.embedding);
        if (!emb || emb.length === 0) continue;
        if (!peopleMap.has(r.personId)) peopleMap.set(r.personId, []);
        const arr = peopleMap.get(r.personId)!;
        if (arr.length < 5) arr.push(emb);
      }
      console.log('[faces:process-unassigned] loaded existing embeddings', { people: peopleMap.size, ms: Date.now() - tStart });
    }

    for (const f of faces) {
      let bestPerson: string | null = null;
      let bestSim = 0;
      for (const [pid, embs] of peopleMap.entries()) {
        for (const pe of embs) {
          const sim = cosineSimilarity(f.emb, pe);
          if (sim >= threshold && sim > bestSim) {
            bestSim = sim; bestPerson = pid;
          }
        }
      }
      if (bestPerson) {
        if (opts.dryRun) {
          assignedExisting++;
          processed++;
        } else {
          await prisma.face.update({ where: { id: f.id }, data: { personId: bestPerson } });
          assignedExisting++; processed++;
        }
      } else {
        remaining.push(f);
      }
    }
  } else {
    remaining.push(...faces);
  }

  // 3) Cluster remaining faces and create new persons
  if (remaining.length > 0 && (opts.mode === 'create_new' || opts.mode === 'both')) {
    const m = remaining.length;
    const parent = Array.from({ length: m }, (_, i) => i);
    const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const norm = remaining.map(r => {
      const e = r.emb; let mag = 0; for (const v of e) mag += v*v; mag = Math.sqrt(mag);
      return mag === 0 ? e.slice() : e.map(v => v/mag);
    });
    const maxComparisons = opts.maxComparisons; // configurable cap
    let comparisons = 0;
    for (let i = 0; i < m && comparisons < maxComparisons; i++) {
      for (let j = i + 1; j < m && comparisons < maxComparisons; j++) {
        comparisons++;
        let dot = 0; const a = norm[i], b = norm[j];
        for (let k = 0; k < a.length; k++) dot += a[k]*b[k];
        if (dot >= threshold) union(i, j);
      }
    }
    const groups = new Map<number, number[]>();
    for (let i = 0; i < m; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i); }
    const clusters: Array<{ ids: string[] }> = [];
    for (const idxs of groups.values()) { if (idxs.length > 1) clusters.push({ ids: idxs.map(i => remaining[i].id) }); }
    console.log('[faces:process-unassigned] clustering', { remaining: m, clusters: clusters.length, comparisons, ms: Date.now() - tStart });

    const updatedPersonIds: string[] = [];
    for (const cluster of clusters) {
      if (opts.dryRun) {
        createdPeople++; processed += cluster.ids.length;
      } else {
        const person = await prisma.person.create({ data: { name: `Person ${Date.now()}${Math.random().toString(36).slice(2,6)}`, confirmed: false } });
        await prisma.face.updateMany({ where: { id: { in: cluster.ids } }, data: { personId: person.id } });
        createdPeople++; processed += cluster.ids.length;
        updatedPersonIds.push(person.id);
      }
    }
    // Update centroids for any new persons
    if (!opts.dryRun && updatedPersonIds.length > 0) {
      const { updatePersonCentroid } = await import('../lib/people');
      for (const pid of updatedPersonIds) {
        try { await updatePersonCentroid(pid); } catch {}
      }
    }
  }

  console.log('[faces:process-unassigned] done', {
    processed,
    createdPeople,
    assignedExisting,
    totalInput: faces.length,
    ms: Date.now() - tStart,
    dryRun: !!opts.dryRun,
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
