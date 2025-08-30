import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSimilarity } from '@/lib/face-detection';
import { meanVector, normalizeVector, parsePgvectorText, toPgvectorLiteral } from '@/lib/vector-utils';

interface Params {
  id: string;
}

// Helper to get face recognition settings
async function getFaceRecognitionSettings() {
  const settings = await prisma.siteSettings.findMany({
    where: {
      key: {
        in: [
          'faceRecognitionSimilarityThreshold',
        ],
      },
    },
  });

  const settingsMap = settings.reduce((acc: Record<string, string>, setting: { key: string; value: string }) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  return {
    faceRecognitionSimilarityThreshold: parseFloat(settingsMap.faceRecognitionSimilarityThreshold || '0.7'),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;
    const settings = await getFaceRecognitionSettings();
    let { faceRecognitionSimilarityThreshold } = settings;

    // Allow optional override via query param: ?threshold=0.6
    try {
      const url = new URL(request.url);
      const qp = url.searchParams.get('threshold');
      if (qp) {
        const parsed = parseFloat(qp);
        if (!Number.isNaN(parsed) && parsed >= 0.0 && parsed <= 1.0) {
          faceRecognitionSimilarityThreshold = parsed;
        }
      }
    } catch (e) {
      // ignore malformed url/param - fall back to settings
    }

    // Try pgvector path first: build query vector as normalized mean of this person's face vectors
    try {
      const personVecRows = await prisma.$queryRaw<Array<{ v: string }>>`
        SELECT embedding_vec::text AS v FROM faces
        WHERE "personId" = ${personId} AND embedding_vec IS NOT NULL AND ignored = false
        ORDER BY confidence DESC
        LIMIT 50
      `;
      const personVectors = personVecRows
        .map((r) => parsePgvectorText(r.v))
        .filter((v) => v.length > 0);
      if (personVectors.length > 0) {
        const q = normalizeVector(meanVector(personVectors));
        const lit = toPgvectorLiteral(q);
        // KNN over unassigned faces
        const rows = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT f.id, 1 - (f.embedding_vec <=> ${lit}::vector) AS similarity
          FROM faces f
          WHERE f."personId" IS NULL AND f."hasEmbedding" = true AND f.ignored = false AND f.embedding_vec IS NOT NULL
          ORDER BY f.embedding_vec <=> ${lit}::vector
          LIMIT 300
        `;
        const filtered = rows.filter((r) => typeof r.similarity === 'number' && r.similarity >= faceRecognitionSimilarityThreshold);
        const ids = filtered.map((r) => r.id);
        if (ids.length === 0) return NextResponse.json({ similarFaces: [], usedThreshold: faceRecognitionSimilarityThreshold });
        const faces = await prisma.face.findMany({
          where: { id: { in: ids } },
          include: { photo: { select: { id: true, filename: true, thumbnails: true } } },
        });
        const simMap = new Map(filtered.map((r) => [r.id, r.similarity] as const));
        const result = faces
          .map((f) => ({ ...f, boundingBox: JSON.parse(f.boundingBox), similarity: simMap.get(f.id) || 0 }))
          .sort((a, b) => (b as any).similarity - (a as any).similarity);
        return NextResponse.json({ similarFaces: result, usedThreshold: faceRecognitionSimilarityThreshold });
      }
    } catch (e) {
      // Fallback to legacy path below
    }

    // Legacy fallback using JSON embeddings & app-side similarity
    // Get all faces for the given person
    const personFaces = await prisma.face.findMany({
      where: {
        personId: personId,
        embedding: { not: null },
      },
      select: {
        id: true,
        embedding: true,
      },
    });

    if (personFaces.length === 0) {
      return NextResponse.json({ similarFaces: [] });
    }

    const personEmbeddings = personFaces.map(face => JSON.parse(face.embedding as string));
    const unassignedFaces = await prisma.face.findMany({
      where: { personId: null, embedding: { not: null } },
      include: { photo: { select: { id: true, filename: true, thumbnails: true } } },
    });

    const similarFaces: any[] = [];
    for (const unassignedFace of unassignedFaces) {
      if (!unassignedFace.embedding) continue;
      const unassignedEmbedding = JSON.parse(unassignedFace.embedding as string);
      let maxSimilarity = 0;
      for (const personEmbedding of personEmbeddings) {
        const similarity = calculateSimilarity(unassignedEmbedding, personEmbedding);
        if (similarity > maxSimilarity) maxSimilarity = similarity;
      }
      if (maxSimilarity >= faceRecognitionSimilarityThreshold) {
        similarFaces.push({
          ...unassignedFace,
          boundingBox: JSON.parse(unassignedFace.boundingBox),
          similarity: maxSimilarity,
        });
      }
    }
    similarFaces.sort((a, b) => b.similarity - a.similarity);
    return NextResponse.json({ similarFaces, usedThreshold: faceRecognitionSimilarityThreshold });
  } catch (error) {
    console.error('Error finding similar faces:', error);
    return NextResponse.json(
      { error: 'Failed to find similar faces' },
      { status: 500 }
    );
  }
}
