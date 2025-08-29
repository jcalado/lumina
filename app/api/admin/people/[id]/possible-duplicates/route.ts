import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSimilarity } from '@/lib/face-detection';

interface Params {
  id: string;
}

async function getSimilarityThreshold(defaultValue = 0.7) {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'faceRecognitionSimilarityThreshold' },
      select: { value: true },
    });
    if (!setting?.value) return defaultValue;
    const parsed = parseFloat(setting.value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;

    let threshold = await getSimilarityThreshold(0.7);
    // Optional override via query param
    try {
      const url = new URL(request.url);
      const qp = url.searchParams.get('threshold');
      if (qp) {
        const p = parseFloat(qp);
        if (!Number.isNaN(p) && p >= 0.0 && p <= 1.0) threshold = p;
      }
    } catch {}

    // Load embeddings for target person (exclude ignored faces)
    const targetFaces = await prisma.face.findMany({
      where: { personId, hasEmbedding: true, ignored: false },
      select: { id: true, embedding: true },
    });

    if (targetFaces.length === 0) {
      return NextResponse.json({ duplicates: [], usedThreshold: threshold });
    }

    const targetEmbeddings: Array<{ id: string; vec: number[] }> = targetFaces
      .map(f => ({ id: f.id, vec: JSON.parse((f.embedding as string) || '[]') }))
      .filter(f => Array.isArray(f.vec) && f.vec.length > 0);

    if (targetEmbeddings.length === 0) {
      return NextResponse.json({ duplicates: [], usedThreshold: threshold });
    }

    // Load other persons with a subset of their faces (highest confidence first) that have embeddings
    const otherPersons = await prisma.person.findMany({
      where: { id: { not: personId } },
      select: {
        id: true,
        name: true,
        confirmed: true,
        _count: { select: { faces: true } },
        faces: {
          where: { hasEmbedding: true, ignored: false },
          select: { id: true, embedding: true, confidence: true },
          orderBy: { confidence: 'desc' },
          take: 25, // limit per person for efficiency
        },
      },
    });

    const candidates: Array<{
      id: string;
      name: string | null;
      confirmed: boolean;
      faceCount: number;
      bestSimilarity: number;
      previewFaceId: string | null;
    }> = [];

    for (const p of otherPersons) {
      if (!p.faces || p.faces.length === 0) continue;
      let best = 0;
      let bestFaceId: string | null = null;

      for (const pf of p.faces) {
        const v2 = JSON.parse((pf.embedding as string) || '[]');
        if (!Array.isArray(v2) || v2.length === 0) continue;
        for (const t of targetEmbeddings) {
          const sim = calculateSimilarity(t.vec, v2);
          if (sim > best) {
            best = sim;
            bestFaceId = pf.id;
          }
        }
      }

      if (best >= threshold) {
        candidates.push({
          id: p.id,
          name: p.name,
          confirmed: p.confirmed,
          faceCount: p._count.faces,
          bestSimilarity: best,
          previewFaceId: bestFaceId,
        });
      }
    }

    candidates.sort((a, b) => b.bestSimilarity - a.bestSimilarity);

    return NextResponse.json({ duplicates: candidates, usedThreshold: threshold });
  } catch (error) {
    console.error('Error computing possible duplicates:', error);
    return NextResponse.json({ error: 'Failed to compute possible duplicates' }, { status: 500 });
  }
}

