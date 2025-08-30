import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildLSHBuckets } from '@/lib/lsh';

// In-memory progress store (in production, use Redis)
const progressStore = new Map<string, any>();

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
  continuous?: boolean; // enable continuous processing until target reached
  targetFaceCount?: number; // stop when unassigned faces drop below this count
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

async function getConfidenceThresholdFromSettings(): Promise<number> {
  const rows = await prisma.siteSettings.findMany({
    where: { key: 'faceRecognitionConfidenceThreshold' },
  });
  const val = rows[0]?.value;
  const num = parseFloat(val || '0.5');
  return isNaN(num) ? 0.5 : num;
}

// Continuous processing function
async function startContinuousProcessing(jobId: string, params: any, initialCount: number) {
  const {
    similarityThreshold,
    mode,
    limit,
    offset,
    randomize,
    maxComparisons,
    preCluster,
    bands,
    rowsPerBand,
    maxBucketComparisons,
    targetFaceCount
  } = params;

  // Run in background (not awaited)
  setImmediate(async () => {
    try {
      let batchNumber = 0;
      let totalFacesProcessed = 0;

      while (true) {
        batchNumber++;

        // Check if job was cancelled
        const progress = progressStore.get(jobId);
        if (!progress?.isActive) {
          progressStore.set(jobId, { ...progress, status: 'Cancelled', isActive: false });
          break;
        }

        // Get current unassigned face count
        const currentCount = await prisma.face.count({
          where: {
            personId: null,
            ignored: { not: true },
            hasEmbedding: true,
            embedding: { not: null }
          }
        });

        // Check if we've reached the target
        if (currentCount <= targetFaceCount) {
          progressStore.set(jobId, {
            ...progress,
            status: 'Completed',
            isActive: false,
            facesProcessed: totalFacesProcessed,
            currentBatch: batchNumber - 1,
            totalFaces: initialCount, // Keep initial count for progress calculation
            totalBatches: Math.max(1, Math.ceil((initialCount - targetFaceCount) / limit)) // Use initial calculation
          });
          break;
        }

        // Update progress with current state
        progressStore.set(jobId, {
          ...progress,
          currentBatch: batchNumber,
          totalBatches: Math.max(1, Math.ceil((initialCount - targetFaceCount) / limit)), // Use initial calculation
          status: `Processing batch ${batchNumber}...`,
          facesProcessed: totalFacesProcessed,
          totalFaces: initialCount // Keep initial count for progress calculation
        });

        // Process one batch
        try {
          const result = await processBatch({
            similarityThreshold,
            mode,
            limit,
            offset: offset + (batchNumber - 1) * limit,
            randomize,
            maxComparisons,
            preCluster,
            bands,
            rowsPerBand,
            maxBucketComparisons
          });

          totalFacesProcessed += result.processed;

          // Update progress with batch results
          const updatedProgress = progressStore.get(jobId);
          progressStore.set(jobId, {
            ...updatedProgress,
            facesProcessed: totalFacesProcessed,
            status: `Batch ${batchNumber} completed: ${result.message}`
          });

        } catch (batchError) {
          console.error(`Batch ${batchNumber} failed:`, batchError);
          progressStore.set(jobId, {
            ...progressStore.get(jobId),
            status: `Batch ${batchNumber} failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`,
            isActive: false
          });
          break;
        }

        // Small delay between batches to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Continuous processing failed:', error);
      const progress = progressStore.get(jobId);
      progressStore.set(jobId, {
        ...progress,
        status: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isActive: false
      });
    }
  });
}

// Extract single batch processing logic into a separate function
async function processBatch(params: any) {
  const {
    similarityThreshold,
    mode,
    limit,
    offset,
    randomize,
    maxComparisons,
    preCluster,
    bands,
    rowsPerBand,
    maxBucketComparisons
  } = params;

  const t0 = Date.now();
  console.log('[process-batch] start', { threshold: similarityThreshold, mode, limit, offset });

  // Get confidence threshold from settings
  const confidenceThreshold = await getConfidenceThresholdFromSettings();

  // Fetch unassigned faces with embeddings
  let unassignedRows: Array<{ id: string; confidence: number; embedding: string | null }> | null = null;
  try {
    if (randomize || offset > 0) {
      const order = randomize ? 'random()' : 'confidence DESC';
      const sql = `SELECT id, confidence, embedding FROM "faces" WHERE "personId" IS NULL AND ("ignored" IS NULL OR "ignored" = FALSE) AND "hasEmbedding" = TRUE AND embedding IS NOT NULL ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`;
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
    console.log('[process-batch] fetched faces', { count: unassignedRows ? unassignedRows.length : 0, ms: Date.now() - t0 });
  } catch (rawErr) {
    console.warn('[process-batch] raw fetch failed, falling back to ORM', rawErr);
    const unassignedFacesBase = await prisma.face.findMany({
      where: {
        personId: null,
        ignored: { not: true },
        hasEmbedding: true,
        embedding: { not: null }
      },
      select: { id: true, confidence: true, embedding: true },
      orderBy: { confidence: 'desc' },
      take: limit,
      skip: offset
    });
    unassignedRows = unassignedFacesBase.map(f => ({
      id: f.id,
      confidence: f.confidence,
      embedding: f.embedding
    }));
  }

  if (!unassignedRows || unassignedRows.length === 0) {
    return { processed: 0, message: 'No faces to process' };
  }

  // Parse embeddings
  const unassignedWithEmb = unassignedRows
    .map(r => ({ ...r, emb: parseEmbedding(r.embedding) }))
    .filter(r => r.emb !== null) as Array<{ id: string; confidence: number; emb: number[] }>;

  if (unassignedWithEmb.length === 0) {
    return { processed: 0, message: 'No valid embeddings found' };
  }

  let processedCount = 0;
  let assignedToExistingCount = 0;
  let newPeopleCount = 0;
  let createdGroups = 0;

  // First pass: Try to match to existing people using pgvector KNN
  if (mode === 'assign_existing' || mode === 'both') {
    const remaining: Array<{ id: string; confidence: number; emb: number[] }> = [];

    // Get all existing people with centroids
    const peopleWithCentroids = await prisma.person.findMany({
      where: { centroidEmbedding: { not: null } },
      select: { id: true, centroidEmbedding: true, name: true }
    });

    if (peopleWithCentroids.length > 0) {
      // Process in smaller batches to avoid memory issues
      const batchSize = 50;
      for (let i = 0; i < unassignedWithEmb.length; i += batchSize) {
        const batch = unassignedWithEmb.slice(i, i + batchSize);

        const batchPromises = batch.map(async (face) => {
          // Use pgvector to find similar existing people
          const similarPeople = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
            SELECT id, 1 - ("centroidEmbedding"::vector <=> ${face.emb}::vector) as similarity
            FROM "people"
            WHERE "centroidEmbedding" IS NOT NULL
            ORDER BY "centroidEmbedding"::vector <=> ${face.emb}::vector
            LIMIT 10
          `;

          let bestPerson: string | null = null;
          let bestScore = 1.0;

          for (const person of similarPeople) {
            if (person.similarity >= similarityThreshold) {
              bestPerson = person.id;
              bestScore = 1 - person.similarity; // Convert to distance
              break;
            }
          }

          return { face, bestPerson, bestScore };
        });

        const batchResults = await Promise.all(batchPromises);

        // Process results and update database
        const assignments = batchResults.filter(r => r.bestPerson && r.bestScore < (1 - similarityThreshold));
        if (assignments.length > 0) {
          await Promise.all(assignments.map(async (r) => {
            await prisma.face.update({
              where: { id: r.face.id },
              data: { personId: r.bestPerson }
            });
          }));

          // Update centroids for assigned persons
          const uniquePersons = [...new Set(assignments.map(r => r.bestPerson))];
          await Promise.all(uniquePersons.map(async (personId) => {
            try {
              const mod = await import('@/lib/people');
              await mod.updatePersonCentroid(personId!);
            } catch {}
          }));

          processedCount += assignments.length;
          assignedToExistingCount += assignments.length;
        }

        // Add unassigned faces to remaining
        batchResults.filter(r => !r.bestPerson || r.bestScore >= (1 - similarityThreshold))
          .forEach(r => remaining.push(r.face));
      }
    } else {
      remaining.push(...unassignedWithEmb);
    }

    // Cluster remaining unassigned faces by embedding similarity
    const clusters: Array<{ ids: string[] }> = [];
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
          const pairs: Array<{i: number, j: number, dist: number}> = [];
          for (let aIdx = 0; aIdx < idxs.length; aIdx++) {
            for (let bIdx = aIdx + 1; bIdx < idxs.length; bIdx++) {
              if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
              const i = idxs[aIdx], j = idxs[bIdx];
              pairs.push({i, j, dist: 0});
              local++; comparisons++;
            }
            if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
          }

          pairs.forEach(p => {
            let dot = 0;
            const a = norm[p.i], b = norm[p.j];
            for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
            if (dot >= similarityThreshold) union(p.i, p.j);
          });
        }
        console.log('[process-batch] lsh clustering', { remaining: m, bands, rowsPerBand, comparisons, ms: Date.now() - t0 });
      } else {
        // Full pairwise with global cap
        const pairs: Array<{i: number, j: number, dist: number}> = [];
        for (let i = 0; i < m && comparisons < maxComparisons; i++) {
          for (let j = i + 1; j < m && comparisons < maxComparisons; j++) {
            pairs.push({i, j, dist: 0});
            comparisons++;
          }
        }

        pairs.forEach(p => {
          let dot = 0;
          const a = norm[p.i], b = norm[p.j];
          for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
          if (dot >= similarityThreshold) union(p.i, p.j);
        });
      }

      // Extract clusters
      const clusterMap = new Map<number, number[]>();
      for (let i = 0; i < m; i++) {
        const root = find(i);
        if (!clusterMap.has(root)) clusterMap.set(root, []);
        clusterMap.get(root)!.push(i);
      }

      for (const [, indices] of clusterMap) {
        if (indices.length >= 2) {
          clusters.push({ ids: indices.map(i => remaining[i].id) });
        }
      }

      console.log('[process-batch] found clusters', { clusters: clusters.length, ms: Date.now() - t0 });

      // Create people for valid clusters (parallel processing)
      if (clusters.length > 0) {
        const createPromises = clusters.map(async (cluster) => {
          if (cluster.ids.length < 2) return 0;

          // Calculate centroid
          const faces = cluster.ids.map(id => remaining.find(r => r.id === id)!);
          const centroid = faces[0].emb.slice();
          for (let i = 1; i < faces.length; i++) {
            for (let j = 0; j < centroid.length; j++) {
              centroid[j] += faces[i].emb[j];
            }
          }
          for (let j = 0; j < centroid.length; j++) {
            centroid[j] /= faces.length;
          }

          // Create person
          const person = await prisma.person.create({
            data: {
              name: `Person ${Date.now()}`,
              centroidEmbedding: JSON.stringify(centroid)
            }
          });

          // Assign faces to person
          await prisma.face.updateMany({
            where: { id: { in: cluster.ids } },
            data: { personId: person.id }
          });

          return cluster.ids.length;
        });

        const faceCounts = await Promise.all(createPromises);
        processedCount += faceCounts.reduce((sum, count) => sum + count, 0);
        newPeopleCount = clusters.length;
        createdGroups = clusters.length;
      }
    }
  }

  const totalTime = Date.now() - t0;
  console.log(`[process-batch] completed in ${totalTime}ms, processed ${processedCount} faces`);

  return {
    processed: processedCount,
    message: `Processed ${processedCount} faces: created ${newPeopleCount} new people, assigned ${assignedToExistingCount} to existing people`
  };
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

    // Timing variables
    let queryCount = 0;
    const startTime = Date.now();
    const maxComparisons = Number.isFinite(body.maxComparisons as any) && (body.maxComparisons as any)! > 0 ? Math.min(Number(body.maxComparisons), 500000) : 50000;
    const preCluster = !!body.preCluster;
    const bands = Number.isFinite(body.bands as any) && (body.bands as any)! > 0 ? Math.min(Number(body.bands), 32) : 8;
    const rowsPerBand = Number.isFinite(body.rowsPerBand as any) && (body.rowsPerBand as any)! > 0 ? Math.min(Number(body.rowsPerBand), 16) : 4;
    const maxBucketComparisons = Number.isFinite(body.maxBucketComparisons as any) && (body.maxBucketComparisons as any)! > 0 ? Math.min(Number(body.maxBucketComparisons), 250000) : Math.max(1000, Math.floor(maxComparisons / Math.max(1, bands)));

    if (similarityThreshold === undefined) {
      similarityThreshold = await getSimilarityThresholdFromSettings();
    }

    // Get confidence threshold from settings
    const confidenceThreshold = await getConfidenceThresholdFromSettings();

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return NextResponse.json(
        { error: 'Similarity threshold must be between 0 and 1' },
        { status: 400 }
      );
    }

    // Handle continuous processing
    const continuous = !!body.continuous;
    const targetFaceCount = Number.isFinite(body.targetFaceCount as any) ? Math.max(Number(body.targetFaceCount), 0) : undefined;

    if (continuous) {
      const jobId = `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get initial unassigned face count
      const initialCount = await prisma.face.count({
        where: {
          personId: null,
          ignored: { not: true },
          hasEmbedding: true,
          embedding: { not: null }
        }
      });

      // Initialize progress
      progressStore.set(jobId, {
        isActive: true,
        jobId,
        currentBatch: 0,
        totalBatches: Math.max(1, Math.ceil((initialCount - (targetFaceCount || Math.floor(initialCount * 0.1))) / limit)),
        facesProcessed: 0,
        totalFaces: initialCount,
        targetFaceCount: targetFaceCount || Math.floor(initialCount * 0.1),
        status: 'Starting continuous processing...',
        startTime: Date.now()
      });

      // Start background processing
      startContinuousProcessing(jobId, {
        similarityThreshold,
        mode,
        limit,
        offset,
        randomize,
        maxComparisons,
        preCluster,
        bands,
        rowsPerBand,
        maxBucketComparisons,
        targetFaceCount: targetFaceCount || Math.floor(initialCount * 0.1)
      }, initialCount);

      return NextResponse.json({
        jobId,
        message: 'Continuous processing started',
        initialFaceCount: initialCount,
        targetFaceCount: targetFaceCount || Math.floor(initialCount * 0.1)
      });
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
      console.log('[process-unassigned] fetched via raw', { count: unassignedRows ? unassignedRows.length : 0, ms: Date.now() - t0 });
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
    let createdGroups = 0;

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

    // Assign to existing people using pgvector KNN for efficiency
    const remaining: typeof unassignedWithEmb = [];
    if (mode === 'assign_existing' || mode === 'both') {
      // Batch process assignments in chunks to reduce database round trips
      const batchSize = 50;
      for (let i = 0; i < unassignedWithEmb.length; i += batchSize) {
        const batch = unassignedWithEmb.slice(i, i + batchSize);
        const batchPromises = batch.map(async (f) => {
          const queryStart = Date.now();
          queryCount++;

          // Use pgvector to find top similar existing faces/people with confidence weighting
          const similar = await prisma.$queryRaw<Array<{ personId: string; distance: number; confidence: number }>>`
            SELECT f."personId", (f.embedding::vector <=> ${JSON.stringify(f.emb)}::vector) as distance, f.confidence
            FROM "faces" f
            WHERE f."personId" IS NOT NULL
              AND f."hasEmbedding" = TRUE
              AND f.embedding IS NOT NULL
              AND (f."ignored" IS NULL OR f."ignored" = FALSE)
              AND f.confidence > ${confidenceThreshold}
            ORDER BY f.embedding::vector <=> ${JSON.stringify(f.emb)}::vector
            LIMIT 10
          `;

          const queryTime = Date.now() - queryStart;
          if (queryCount % 100 === 0) {
            console.log(`[process-unassigned] Query ${queryCount}/${unassignedWithEmb.length} took ${queryTime}ms`);
          }

          let bestPerson: string | null = null;
          let bestScore = 1; // Lower distance is better, weighted by confidence
          for (const s of similar) {
            const weightedScore = s.distance / (s.confidence + 0.1); // Weight by confidence
            if (weightedScore < bestScore) {
              bestScore = weightedScore;
              bestPerson = s.personId;
            }
          }

          return { face: f, bestPerson, bestScore };
        });

        const batchResults = await Promise.all(batchPromises);

        // Process results and update database in batches
        const assignments = batchResults.filter(r => r.bestPerson && r.bestScore < (1 - (similarityThreshold as number)));
        if (assignments.length > 0) {
          // Batch update assignments
          await Promise.all(assignments.map(async (r) => {
            await prisma.face.update({
              where: { id: r.face.id },
              data: { personId: r.bestPerson }
            });
          }));

          // Update centroids for assigned persons (deduplicate person IDs)
          const uniquePersons = [...new Set(assignments.map(r => r.bestPerson))];
          await Promise.all(uniquePersons.map(async (personId) => {
            try {
              const mod = await import('@/lib/people');
              await mod.updatePersonCentroid(personId!);
            } catch {}
          }));

          processedCount += assignments.length;
          assignedToExistingCount += assignments.length;
        }

        // Add unassigned faces to remaining
        batchResults.filter(r => !r.bestPerson || r.bestScore >= (1 - (similarityThreshold as number)))
          .forEach(r => remaining.push(r.face));
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
          // Batch distance calculations for this bucket
          const pairs: Array<{i: number, j: number, dist: number}> = [];
          for (let aIdx = 0; aIdx < idxs.length; aIdx++) {
            for (let bIdx = aIdx + 1; bIdx < idxs.length; bIdx++) {
              if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
              const i = idxs[aIdx], j = idxs[bIdx];
              pairs.push({i, j, dist: 0}); // placeholder
              local++; comparisons++;
            }
            if (comparisons >= maxComparisons || local >= maxBucketComparisons) break;
          }

          // Compute distances using optimized cosine similarity (vectors are normalized)
          pairs.forEach(p => {
            let dot = 0;
            const a = norm[p.i], b = norm[p.j];
            for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
            if (dot >= (similarityThreshold as number)) union(p.i, p.j);
          });
        }
        console.log('[process-unassigned] lsh clustering optimized', { remaining: m, bands, rowsPerBand, comparisons, ms: Date.now() - t0 });
      } else {
        // Full pairwise with global cap using batched pgvector
        const pairs: Array<{i: number, j: number, dist: number}> = [];
        for (let i = 0; i < m && comparisons < maxComparisons; i++) {
          for (let j = i + 1; j < m && comparisons < maxComparisons; j++) {
            pairs.push({i, j, dist: 0});
            comparisons++;
          }
        }

        // Compute distances using optimized cosine similarity
        pairs.forEach(p => {
          let dot = 0;
          const a = norm[p.i], b = norm[p.j];
          for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
          if (dot >= (similarityThreshold as number)) union(p.i, p.j);
        });
        console.log('[process-unassigned] clustering optimized', { remaining: m, comparisons, ms: Date.now() - t0 });
      }

      // Build groups and filter out single-face clusters
      const groups = new Map<number, number[]>();
      for (let i = 0; i < m; i++) {
        const r = find(i);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(i);
      }

      // Filter clusters to only include those with multiple faces
      const validClusters = Array.from(groups.values())
        .filter(idxs => idxs.length > 1)
        .map(idxs => ({ ids: idxs.map(i => remaining[i].id) }));

      console.log('[process-unassigned] found clusters', { totalGroups: groups.size, validClusters: validClusters.length, ms: Date.now() - t0 });

            // Create persons and assign faces for each cluster (batched for performance)
      const createPromises = validClusters.map(async (cluster) => {
        // Use a transaction for atomicity and better performance
        return await prisma.$transaction(async (tx) => {
          const person = await tx.person.create({
            data: {
              name: `Person ${Date.now()}${Math.random().toString(36).slice(2,6)}`,
              confirmed: false
            }
          });

          await tx.face.updateMany({
            where: { id: { in: cluster.ids } },
            data: { personId: person.id }
          });

          // Update centroid asynchronously (don't block cluster creation)
          setImmediate(async () => {
            try {
              const mod = await import('@/lib/people');
              await mod.updatePersonCentroid(person.id);
            } catch (err) {
              console.warn(`Failed to update centroid for person ${person.id}:`, err);
            }
          });

          return cluster.ids.length;
        });
      });

      const faceCounts = await Promise.all(createPromises);
      processedCount += faceCounts.reduce((sum, count) => sum + count, 0);
      newPeopleCount = validClusters.length;
      createdGroups = validClusters.length;

      console.log('[process-unassigned] created people for clusters (parallel)', { clusters: validClusters.length, ms: Date.now() - t0 });
    }

    const totalTime = Date.now() - startTime;
    console.log(`[process-unassigned] Total processing time: ${totalTime}ms for ${queryCount} queries (${totalTime/queryCount}ms per query)`);

    return NextResponse.json({
      message: `Processed ${processedCount} faces: created ${newPeopleCount} new people, assigned ${assignedToExistingCount} to existing people`,
      processed: processedCount,
      newPeople: newPeopleCount,
      assignedToExisting: assignedToExistingCount,
      totalUnassigned: (unassignedRows ? unassignedRows.length : unassignedFacesBase.length),
      usedSimilarityThreshold: similarityThreshold,
      createdGroups: createdGroups,
    });

  } catch (error) {
    console.error('Failed to process unassigned faces:', error);
    return NextResponse.json(
      { error: 'Failed to process unassigned faces' },
      { status: 500 }
    );
  }
}

// GET: Get processing progress for a job
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId parameter required' }, { status: 400 });
  }

  const progress = progressStore.get(jobId);
  if (!progress) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(progress);
}

// DELETE: Cancel a processing job
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'jobId parameter required' }, { status: 400 });
  }

  const progress = progressStore.get(jobId);
  if (progress) {
    progressStore.set(jobId, { ...progress, isActive: false, status: 'Cancelled' });
  }

  return NextResponse.json({ message: 'Job cancelled' });
}
