import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSimilarity } from '@/lib/face-detection';
import { meanVector, normalizeVector, parsePgvectorText, toPgvectorLiteral } from '@/lib/vector-utils';

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

    // Try pgvector path: use centroid of target person's vectors as query
    try {
      const vecRows = await prisma.$queryRaw<Array<{ v: string }>>`
        SELECT embedding_vec::text AS v FROM faces
        WHERE "personId" = ${personId} AND embedding_vec IS NOT NULL AND ignored = false
        ORDER BY confidence DESC
        LIMIT 50
      `;
      const personVectors = vecRows.map((r) => parsePgvectorText(r.v)).filter((v) => v.length > 0);
      if (personVectors.length > 0) {
        const q = normalizeVector(meanVector(personVectors));
        const lit = toPgvectorLiteral(q);
        // Get best (min distance) face per other person and rank
        const rows = await prisma.$queryRaw<Array<{ id: string; name: string | null; confirmed: boolean; faceCount: number; previewFaceId: string; dist: number }>>`
          WITH ranked AS (
            SELECT p.id, p.name, p.confirmed,
                   f.id AS face_id,
                   f.embedding_vec <=> ${lit}::vector AS dist,
                   COUNT(*) OVER (PARTITION BY p.id) AS face_count,
                   ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY f.embedding_vec <=> ${lit}::vector ASC) AS rn
            FROM people p
            JOIN faces f ON f."personId" = p.id AND f."hasEmbedding" = true AND f.ignored = false AND f.embedding_vec IS NOT NULL
            WHERE p.id <> ${personId}
          )
          SELECT id, name, confirmed, face_count as "faceCount", face_id as "previewFaceId", dist
          FROM ranked
          WHERE rn = 1
          ORDER BY dist ASC
          LIMIT 100
        `;
        const candidates = rows
          .map((r) => ({
            id: r.id,
            name: r.name,
            confirmed: r.confirmed,
            faceCount: Number(r.faceCount || 0),
            previewFaceId: r.previewFaceId,
            bestSimilarity: 1 - Number(r.dist || 1),
          }))
          .filter((c) => c.bestSimilarity >= threshold);
        return NextResponse.json({ duplicates: candidates, usedThreshold: threshold });
      }
    } catch (e) {
      // Fallback below
    }

    // Legacy fallback using JSON embeddings
    const targetFaces = await prisma.face.findMany({
      where: { personId, hasEmbedding: true, ignored: false },
      select: { id: true, embedding: true },
    });
    if (targetFaces.length === 0) return NextResponse.json({ duplicates: [], usedThreshold: threshold });
    const targetEmbeddings: Array<{ id: string; vec: number[] }> = targetFaces
      .map(f => ({ id: f.id, vec: JSON.parse((f.embedding as string) || '[]') }))
      .filter(f => Array.isArray(f.vec) && f.vec.length > 0);
    if (targetEmbeddings.length === 0) return NextResponse.json({ duplicates: [], usedThreshold: threshold });

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
          take: 25,
        },
      },
    });

    const candidates: Array<{ id: string; name: string | null; confirmed: boolean; faceCount: number; bestSimilarity: number; previewFaceId: string | null; }> = [];
    for (const p of otherPersons) {
      if (!p.faces || p.faces.length === 0) continue;
      let best = 0;
      let bestFaceId: string | null = null;
      for (const pf of p.faces) {
        const v2 = JSON.parse((pf.embedding as string) || '[]');
        if (!Array.isArray(v2) || v2.length === 0) continue;
        for (const t of targetEmbeddings) {
          const sim = calculateSimilarity(t.vec, v2);
          if (sim > best) { best = sim; bestFaceId = pf.id; }
        }
      }
      if (best >= threshold) {
        candidates.push({ id: p.id, name: p.name, confirmed: p.confirmed, faceCount: p._count.faces, bestSimilarity: best, previewFaceId: bestFaceId });
      }
    }
    candidates.sort((a, b) => b.bestSimilarity - a.bestSimilarity);
    return NextResponse.json({ duplicates: candidates, usedThreshold: threshold });
  } catch (error) {
    console.error('Error computing possible duplicates:', error);
    return NextResponse.json({ error: 'Failed to compute possible duplicates' }, { status: 500 });
  }
}
