import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface ProcessRequest {
  similarityThreshold?: number;
  mode?: 'create_new' | 'assign_existing' | 'both';
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

    if (similarityThreshold === undefined) {
      similarityThreshold = await getSimilarityThresholdFromSettings();
    }

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return NextResponse.json(
        { error: 'Similarity threshold must be between 0 and 1' },
        { status: 400 }
      );
    }

    // Get all unassigned faces with embeddings
    const unassignedFaces = await prisma.face.findMany({
      where: {
        personId: null,
        ignored: { not: true },
        hasEmbedding: true,
        embedding: { not: null },
      },
      select: { id: true, confidence: true, embedding: true },
      orderBy: { confidence: 'desc' },
    });

    if (unassignedFaces.length === 0) {
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

    // Prepare embeddings
    const unassignedWithEmb = unassignedFaces
      .map(f => ({ id: f.id, confidence: f.confidence, emb: parseEmbedding(f.embedding as any) }))
      .filter(f => f.emb && f.emb.length) as Array<{ id: string; confidence: number; emb: number[] }>;

    // Get existing people with a few face embeddings (if mode allows assignment to existing)
    const existingPeople = (mode === 'assign_existing' || mode === 'both')
      ? await prisma.person.findMany({
          include: {
            faces: {
              where: { ignored: { not: true }, hasEmbedding: true, embedding: { not: null } },
              orderBy: { confidence: 'desc' },
              take: 5,
              select: { id: true, embedding: true },
            },
          },
        })
      : [];

    const existingPeopleEmb = existingPeople.map(p => ({
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

      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          let dot = 0; const a = norm[i], b = norm[j];
          for (let k = 0; k < a.length; k++) dot += a[k]*b[k];
          if (dot >= (similarityThreshold as number)) union(i, j);
        }
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
        processedCount += cluster.ids.length;
        newPeopleCount++;
      }
    }

    // Create new people from clusters
    for (const cluster of clusters) {
      if (cluster.faces.length === 0) continue;
      
      // Create new person
      const person = await prisma.person.create({
        data: {
          name: `Person ${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
          confirmed: false
        }
      });

      // Assign all faces in cluster to this person
      await prisma.face.updateMany({
        where: {
          id: { in: cluster.faces.map((f: typeof unassignedFaces[0]) => f.id) }
        },
        data: {
          personId: person.id
        }
      });

      processedCount += cluster.faces.length;
      newPeopleCount++;
    }

    return NextResponse.json({
      message: `Processed ${processedCount} faces: created ${newPeopleCount} new people, assigned ${assignedToExistingCount} to existing people`,
      processed: processedCount,
      newPeople: newPeopleCount,
      assignedToExisting: assignedToExistingCount,
      totalUnassigned: unassignedFaces.length,
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
