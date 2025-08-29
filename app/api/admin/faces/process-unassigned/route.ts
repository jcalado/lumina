import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildLSHBuckets } from '@/lib/lsh';

interface ProcessRequest {
  similarityThreshold?: number;
  mode?: 'create_new' | 'assign_existing' | 'both';
  limit?: number; // max number of unassigned faces to consider
  offset?: number; // offset into unassigned list for diversity
  randomize?: boolean; // randomize selection of unassigned faces
  maxComparisons?: number; // cap pairwise comparisons for clustering
  preCluster?: boolean; // use LSH pre-clustering to reduce comparisons
  bands?: number; // LSH bands
  rowsPerBand?: number; // LSH rows per band
  maxBucketComparisons?: number; // cap comparisons per bucket
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
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function getSimilarityThresholdFromSettings(): Promise<number> {
  const rows = await prisma.siteSettings.findMany({
    where: { key: 'faceRecognitionSimilarityThreshold' },
  });
  const val = rows[0]?.value;
  const num = parseFloat(val || '0.7');
  return isNaN(num) ? 0.7 : num;
}

// POST: Process unassigned faces based on similarity threshold
export async function POST(request: NextRequest) {
  try {
    const body: ProcessRequest = await request.json().catch(() => ({}));
    let similarityThreshold = typeof body.similarityThreshold === 'number' ? body.similarityThreshold : undefined;
    const mode: 'create_new' | 'assign_existing' | 'both' = (body.mode as any) || 'both';
    const limit = Number.isFinite(body.limit as any) && (body.limit as any)! > 0 ? Math.min(Number(body.limit), 2000) : 500;
    const offset = Number.isFinite(body.offset as any) && (body.offset as any)! > 0 ? Math.min(Number(body.offset), 1000000) : 0;
    const randomize = !!body.randomize;
    const maxComparisons = Number.isFinite(body.maxComparisons as any) && (body.maxComparisons as any)! > 0 ? Math.min(Number(body.maxComparisons), 500000) : 50000;
    const preCluster = !!body.preCluster;
    const bands = Number.isFinite(body.bands as any) && (body.bands as any)! > 0 ? Math.min(Number(body.bands), 32) : 8;
    const rowsPerBand = Number.isFinite(body.rowsPerBand as any) && (body.rowsPerBand as any)! > 0 ? Math.min(Number(body.rowsPerBand), 16) : 4;
    const maxBucketComparisons = Number.isFinite(body.maxBucketComparisons as any) && (body.maxBucketComparisons as any)! > 0 ? Math.min(Number(body.maxBucketComparisons), 250000) : Math.max(1000, Math.floor(maxComparisons / Math.max(1, bands)));

    if (similarityThreshold === undefined) {
      similarityThreshold = await getSimilarityThresholdFromSettings();
    }

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return NextResponse.json(
        { error: 'Similarity threshold must be between 0 and 1' },
        { status: 400 }
      );
    }

    const t0 = Date.now();
    console.log('[process-unassigned] start', { threshold: similarityThreshold, mode, limit });

    // Try to fetch unassigned faces with embeddings via raw SQL first (fast path)
    let unassignedRows: Array<{ id: string; confidence: number; embedding: string | null }> | null = null;
    try {
      if (randomize || offset > 0) {
        const order = randomize ? 'random()' : 'confidence DESC';
        const sql = `SELECT id, confidence, embedding FROM "faces" WHERE "personId" IS NULL AND ("ignored" IS NULL OR "ignored" = FALSE) AND "hasEmbedding" = TRUE AND embedding IS NOT NULL ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unassignedRows = await prisma.$queryRawUnsafe<any>(sql);
      } else {
        unassignedRows = await prisma.$queryRaw<Array<{ id: string; confidence: number; embedding: string | null }>>`
          SELECT id, confidence, embedding
          FROM "faces"
          WHERE "personId" IS NULL
            AND ("ignored" IS NULL OR "ignored" = FALSE)
            AND "hasEmbedding" = TRUE
            AND embedding IS NOT NULL
          ORDER BY confidence DESC
          LIMIT ${limit}
        `;
      }
      console.log('[process-unassigned] fetched via raw', { count: unassignedRows.length, ms: Date.now() - t0 });
    } catch (rawErrFast) {
      console.warn('[process-unassigned] raw fetch failed, falling back to safe per-id path', rawErrFast);
    }

    // Safe per-id fallback path if raw failed
    let unassignedFacesBase: Array<{ id: string; confidence: number }> = [];
    if (!unassignedRows) {
      try {
        unassignedFacesBase = await prisma.face.findMany({
          where: {
            personId: null,
            ignored: { not: true },
            hasEmbedding: true,
            embedding: { not: null },
          },
          select: { id: true, confidence: true },
          orderBy: { confidence: 'desc' },
          take: limit,
        });
        console.log('[process-unassigned] fetched ids via prisma', { count: unassignedFacesBase.length, ms: Date.now() - t0 });
      } catch (e) {
        // Fallback to raw SQL if Prisma string conversion fails on some rows
        try {
          const rows = await prisma.$queryRaw<Array<{ id: string; confidence: number }>>`
            SELECT id, confidence
            FROM "faces"
            WHERE "personId" IS NULL
              AND ("ignored" IS NULL OR "ignored" = FALSE)
              AND "hasEmbedding" = TRUE
              AND embedding IS NOT NULL
            ORDER BY confidence DESC
            LIMIT ${limit}
          `;
          unassignedFacesBase = rows;
          console.log('[process-unassigned] fetched ids via raw fallback', { count: unassignedFacesBase.length, ms: Date.now() - t0 });
        } catch (rawErr) {
          console.error('Failed fallback fetching unassigned faces via raw SQL:', rawErr);
          throw e; // rethrow original error so caller sees the same context
        }
      }
    }

    if (unassignedRows && unassignedRows.length === 0) {
      return NextResponse.json({
        message: 'No unassigned faces to process',
        processed: 0,
        newPeople: 0,
        assignedToExisting: 0
      });
    }

    if (!unassignedRows && unassignedFacesBase.length === 0) {
      return NextResponse.json({
        message: 'No unassigned faces to process',
        processed: 0,
        newPeople: 0,
        assignedToExisting: 0
      });
    }

    let processedCount = 0;
    let newPeopleCount = 0;
    let assignedToExistingCount = 0;

    // Prepare embeddings (fast path if we got rows already)
    const unassignedWithEmb: Array<{ id: string; confidence: number; emb: number[] }> = [];
    if (unassignedRows) {
      for (const r of unassignedRows) {
        const emb = parseEmbedding(r.embedding as any);
        if (emb && emb.length) unassignedWithEmb.push({ id: r.id, confidence: r.confidence, emb });
      }
      console.log('[process-unassigned] parsed embeddings via raw', { valid: unassignedWithEmb.length, ms: Date.now() - t0 });
    } else {
      // Fetch embeddings per-id to skip any problematic rows
      for (const f of unassignedFacesBase) {
        try {
          const row = await prisma.face.findUnique({ where: { id: f.id }, select: { embedding: true } });
          const emb = parseEmbedding((row?.embedding ?? null) as any);
          if (emb && emb.length) {
            unassignedWithEmb.push({ id: f.id, confidence: f.confidence, emb });
          }
        } catch (perRowErr) {
          // Skip rows that fail to convert/parse; continue processing others
          continue;
        }
      }
      console.log('[process-unassigned] parsed embeddings via per-id', { valid: unassignedWithEmb.length, ms: Date.now() - t0 });
    }

    if (unassignedWithEmb.length === 0) {
      return NextResponse.json({
        message: 'No valid embeddings among unassigned faces to process',
        processed: 0,
        newPeople: 0,
        assignedToExisting: 0,
        totalUnassigned: unassignedFacesBase.length,
        usedSimilarityThreshold: similarityThreshold,
        createdGroups: 0,
      });
    }

    // Get existing people embeddings (prefer centroids)
    let centroidPeople: Array<{ id: string; centroid: number[] } > = [];
    let existingPeople: Array<{ id: string; faces: Array<{ id: string; embedding: string | null }> }> = [];
    if (mode === 'assign_existing' || mode === 'both') {
      try {
        const centroids = await prisma.person.findMany({
          select: { id: true, centroidEmbedding: true },
          where: { centroidEmbedding: { not: null } },
        });
        centroidPeople = centroids
          .map(c => ({ id: c.id, centroid: parseEmbedding(c.centroidEmbedding as any) || [] }))
          .filter(c => c.centroid.length > 0);
        if (centroidPeople.length === 0) {
          existingPeople = await prisma.person.findMany({
            include: {
              faces: {
                where: { ignored: { not: true }, hasEmbedding: true, embedding: { not: null } },
                orderBy: { confidence: 'desc' },
                take: 5,
                select: { id: true, embedding: true },
              },
            },
          });
        }
      } catch (e) {
        // Fallback to raw SQL join if Prisma fails
        try {
          const rows = await prisma.$queryRaw<Array<{ personId: string; faceId: string | null; embedding: string | null }>>`
            SELECT p.id as "personId", f.id as "faceId", f.embedding as embedding
            FROM "people" p
            LEFT JOIN "faces" f
              ON f."personId" = p.id
             AND (f."ignored" IS NULL OR f."ignored" = FALSE)
             AND f."hasEmbedding" = TRUE
             AND f.embedding IS NOT NULL
            ORDER BY p.id
          `;
          const map = new Map<string, Array<{ id: string; embedding: string | null }>>();
          for (const r of rows) {
            if (!map.has(r.personId)) map.set(r.personId, []);
            if (r.faceId) {
              // keep at most 5 embeddings per person, favoring earlier rows
              const arr = map.get(r.personId)!;
              if (arr.length < 5) arr.push({ id: r.faceId, embedding: r.embedding });
            }
          }
          existingPeople = Array.from(map.entries()).map(([id, faces]) => ({ id, faces }));
        } catch (rawErr) {
          console.error('Failed fallback fetching existing people via raw SQL:', rawErr);
          existingPeople = [];
        }
      }
    }

    const existingPeopleEmb = centroidPeople.length > 0
      ? centroidPeople.map(p => ({ id: p.id, faces: [p.centroid] }))
      : existingPeople.map(p => ({
          id: p.id,
          faces: p.faces
            .map(f => parseEmbedding(f.embedding))
            .filter((e): e is number[] => Array.isArray(e) && e.length > 0),
        }));

    // Assign to existing people first using embedding similarity
    const remaining: typeof unassignedWithEmb = [];
    if (mode === 'assign_existing' || mode === 'both') {
      for (const f of unassignedWithEmb) {
        let bestPerson: string | null = null;
        let bestSim = 0;
        for (const p of existingPeopleEmb) {
          for (const pe of p.faces) {
            const sim = cosineSimilarity(f.emb, pe);
            if (sim >= (similarityThreshold as number) && sim > bestSim) {
              bestSim = sim;
              bestPerson = p.id;
            }
          }
        }
        if (bestPerson) {
          await prisma.face.update({ where: { id: f.id }, data: { personId: bestPerson } });
          try { const mod = await import('@/lib/people'); await mod.updatePersonCentroid(bestPerson); } catch {}
          processedCount++;
          assignedToExistingCount++;
        } else {
          remaining.push(f);
        }
      }
    } else {
      remaining.push(...unassignedWithEmb);
    }

    // Cluster remaining unassigned faces by embedding similarity
    const clusters: Array<{ ids: string[] } > = [];
    if (mode === 'create_new' || mode === 'both') {
      const m = remaining.length;
      const parent = Array.from({ length: m }, (_, i) => i);
      const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
      const union = (a: number, b: number) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };

      // Normalize embeddings
      const norm = remaining.map(r => {
        const e = r.emb;
        let mag = 0; for (const v of e) mag += v*v; mag = Math.sqrt(mag);
        return mag === 0 ? e.slice() : e.map(v => v/mag);
      });

      let comparisons = 0;
      if (preCluster) {
        // LSH bucketing to reduce comparisons
        const buckets = buildLSHBuckets(norm, { bands, rowsPerBand });
        for (const [, idxs] of buckets) {
          if (idxs.length < 2) continue;
          let local = 0;
          for (let aIdx = 0; aIdx < idxs.length; aIdx++) {
            for (let bIdx = aIdx + 1; bIdx < idxs.length; bIdx++) {
              if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
              const i = idxs[aIdx], j = idxs[bIdx];
              local++; comparisons++;
              let dot = 0; const a = norm[i], b = norm[j];
              for (let k = 0; k < a.length; k++) dot += a[k]*b[k];
              if (dot >= (similarityThreshold as number)) union(i, j);
            }
            if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
          }
        }
        console.log('[process-unassigned] lsh clustering', { remaining: m, bands, rowsPerBand, comparisons, ms: Date.now() - t0 });
      } else {
        // Full pairwise with global cap
        for (let i = 0; i < m && comparisons < maxComparisons; i++) {
          for (let j = i + 1; j < m && comparisons < maxComparisons; j++) {
            comparisons++;
            let dot = 0; const a = norm[i], b = norm[j];
            for (let k = 0; k < a.length; k++) dot += a[k]*b[k];
            if (dot >= (similarityThreshold as number)) union(i, j);
          }
        }
        console.log('[process-unassigned] clustering', { remaining: m, comparisons, ms: Date.now() - t0 });
      }

      // Build groups
      const groups = new Map<number, number[]>();
      for (let i = 0; i < m; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(i);
      }

      for (const idxs of groups.values()) {
        if (idxs.length > 1) {
          clusters.push({ ids: idxs.map(i => remaining[i].id) });
        }
      }

      // Create persons and assign faces for each cluster
      for (const cluster of clusters) {
        const person = await prisma.person.create({ data: { name: `Person ${Date.now()}${Math.random().toString(36).slice(2,6)}`, confirmed: false } });
        await prisma.face.updateMany({ where: { id: { in: cluster.ids } }, data: { personId: person.id } });
        try { const mod = await import('@/lib/people'); await mod.updatePersonCentroid(person.id); } catch {}
        processedCount += cluster.ids.length;
        newPeopleCount++;
      }
      console.log('[process-unassigned] created people for clusters', { clusters: clusters.length, ms: Date.now() - t0 });
    }

    return NextResponse.json({
      message: `Processed ${processedCount} faces: created ${newPeopleCount} new people, assigned ${assignedToExistingCount} to existing people`,
      processed: processedCount,
      newPeople: newPeopleCount,
      assignedToExisting: assignedToExistingCount,
      totalUnassigned: (unassignedRows ? unassignedRows.length : unassignedFacesBase.length),
      usedSimilarityThreshold: similarityThreshold,
      createdGroups: clusters.length,
    });

  } catch (error) {
    console.error('Failed to process unassigned faces:', error);
    return NextResponse.json(
      { error: 'Failed to process unassigned faces' },
      { status: 500 }
    );
  }
}
