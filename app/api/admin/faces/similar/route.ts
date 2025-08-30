import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toPgvectorLiteral } from '@/lib/vector-utils';

interface Body {
  faceIds?: string[];
  threshold?: number;
}

async function getConfidenceThresholdFromSettings(): Promise<number> {
  const rows = await prisma.siteSettings.findMany({
    where: { key: 'faceRecognitionConfidenceThreshold' },
  });
  const val = rows[0]?.value;
  const num = parseFloat(val || '0.5');
  return isNaN(num) ? 0.5 : num;
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

    // Parse selected embeddings
    const selectedEmbeddings = selectedFaces
      .map(f => {
        try { return JSON.parse(f.embedding as any) as number[] } catch { return null }
      })
      .filter((e): e is number[] => Array.isArray(e) && e.length > 0);

    if (selectedEmbeddings.length === 0) {
      return NextResponse.json({ similarFaces: [] });
    }

    // Convert similarity threshold to distance threshold
    const maxDistance = 1 - threshold!;

    // Get confidence threshold from settings
    const confidenceThreshold = await getConfidenceThresholdFromSettings();

    // Use pgvector to find similar faces efficiently
    // We'll find faces similar to ANY of the selected faces
    const similarFaces = await prisma.$queryRaw<Array<{
      id: string;
      boundingBox: string;
      confidence: number;
      ignored: boolean;
      photoId: string;
      photoFilename: string;
      minDistance: number;
      thumbnails: any;
    }>>`
      SELECT
        f.id,
        f."boundingBox",
        f.confidence,
        f.ignored,
        ph.id as "photoId",
        ph.filename as "photoFilename",
        MIN(f.embedding::vector <=> ${toPgvectorLiteral(selectedEmbeddings[0])}::vector) as "minDistance",
        (
          SELECT json_agg(
            json_build_object(
              'id', t.id,
              'photoId', t."photoId",
              'size', t.size,
              's3Key', t."s3Key",
              'width', t.width,
              'height', t.height
            )
          )
          FROM thumbnails t
          WHERE t."photoId" = ph.id
        ) as thumbnails
      FROM faces f
      JOIN photos ph ON f."photoId" = ph.id
      WHERE f."personId" IS NULL
        AND f.embedding IS NOT NULL
        AND f.ignored = false
        AND f.confidence >= ${confidenceThreshold}
        AND f.id NOT IN (${ids.map(id => `'${id}'`).join(', ')})
        AND (
          ${selectedEmbeddings.map((emb, index) =>
            `(f.embedding::vector <=> ${toPgvectorLiteral(emb)}::vector) <= ${maxDistance}`
          ).join(' OR ')}
        )
      GROUP BY f.id, f."boundingBox", f.confidence, f.ignored, ph.id, ph.filename
      ORDER BY "minDistance" ASC
    `;

    // Convert distance back to similarity and format results
    const formattedResults = similarFaces.map(face => ({
      id: face.id,
      boundingBox: JSON.parse(face.boundingBox),
      confidence: face.confidence,
      ignored: face.ignored,
      photo: {
        id: face.photoId,
        filename: face.photoFilename,
        thumbnails: face.thumbnails || [],
      },
      similarity: 1 - face.minDistance, // Convert distance back to similarity
    }));

    return NextResponse.json({
      similarFaces: formattedResults,
      usedThreshold: threshold
    });

  } catch (error) {
    console.error('Failed to fetch similar faces:', error);
    return NextResponse.json({ error: 'Failed to fetch similar faces' }, { status: 500 });
  }
}

