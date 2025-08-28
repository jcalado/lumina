import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSimilarity } from '@/lib/face-detection';

interface Body {
  faceIds?: string[];
  threshold?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.faceIds) ? body.faceIds.filter(Boolean) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'faceIds is required' }, { status: 400 });
    }
    let threshold = typeof body.threshold === 'number' ? body.threshold : undefined;
    if (threshold === undefined) {
      const settings = await prisma.siteSettings.findMany({ where: { key: 'faceRecognitionSimilarityThreshold' } });
      const val = settings[0]?.value;
      const n = parseFloat(val || '0.7');
      threshold = Number.isFinite(n) ? n : 0.7;
    }
    if (threshold! < 0 || threshold! > 1) {
      return NextResponse.json({ error: 'threshold must be between 0 and 1' }, { status: 400 });
    }

    // Fetch embeddings for selected faces
    const selectedFaces = await prisma.face.findMany({
      where: { id: { in: ids }, embedding: { not: null } },
      select: { id: true, embedding: true }
    });
    if (selectedFaces.length === 0) {
      return NextResponse.json({ similarFaces: [] });
    }
    const selectedEmbeddings = selectedFaces
      .map(f => {
        try { return JSON.parse(f.embedding as any) as number[] } catch { return null }
      })
      .filter((e): e is number[] => Array.isArray(e) && e.length > 0);

    if (selectedEmbeddings.length === 0) {
      return NextResponse.json({ similarFaces: [] });
    }

    // Fetch all unassigned faces with embeddings
    const unassigned = await prisma.face.findMany({
      where: { personId: null, embedding: { not: null } },
      include: {
        photo: {
          select: { id: true, filename: true, thumbnails: true }
        }
      }
    });

    const results: any[] = [];
    for (const f of unassigned) {
      if (!f.embedding) continue;
      let max = 0;
      let emb: number[] | null = null;
      try { emb = JSON.parse(f.embedding as any) } catch {}
      if (!emb || emb.length === 0) continue;
      for (const sel of selectedEmbeddings) {
        const s = calculateSimilarity(emb, sel);
        if (s > max) max = s;
      }
      if (max >= threshold!) {
        results.push({
          id: f.id,
          boundingBox: JSON.parse(f.boundingBox as any),
          confidence: f.confidence,
          ignored: f.ignored,
          photo: {
            id: f.photo.id,
            filename: f.photo.filename,
            thumbnails: f.photo.thumbnails,
          },
          similarity: max,
        });
      }
    }

    results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return NextResponse.json({ similarFaces: results, usedThreshold: threshold });
  } catch (error) {
    console.error('Failed to fetch similar faces:', error);
    return NextResponse.json({ error: 'Failed to fetch similar faces' }, { status: 500 });
  }
}

