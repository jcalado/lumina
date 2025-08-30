import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toPgvectorLiteral } from '@/lib/vector-utils';

async function getConfidenceThresholdFromSettings(): Promise<number> {
  const rows = await prisma.siteSettings.findMany({
    where: { key: 'faceRecognitionConfidenceThreshold' },
  });
  const val = rows[0]?.value;
  const num = parseFloat(val || '0.5');
  return isNaN(num) ? 0.5 : num;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const faceId = params.id;
    const { searchParams } = new URL(request.url);
    const threshold = parseFloat(searchParams.get('threshold') || '0.7');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Validate threshold
    if (threshold < 0 || threshold > 1) {
      return NextResponse.json({ error: 'threshold must be between 0 and 1' }, { status: 400 });
    }

    // Validate limit
    if (limit < 1 || limit > 1000) {
      return NextResponse.json({ error: 'limit must be between 1 and 1000' }, { status: 400 });
    }

    // Fetch the target face with its embedding
    const targetFace = await prisma.face.findUnique({
      where: { id: faceId },
      select: { id: true, embedding: true, personId: true }
    });

    if (!targetFace) {
      return NextResponse.json({ error: 'Face not found' }, { status: 404 });
    }

    if (!targetFace.embedding) {
      return NextResponse.json({ error: 'Face has no embedding data' }, { status: 400 });
    }

    // Parse the target embedding
    let targetEmbedding: number[] | null = null;
    try {
      targetEmbedding = JSON.parse(targetFace.embedding as any);
    } catch (error) {
      return NextResponse.json({ error: 'Invalid embedding data' }, { status: 400 });
    }

    if (!targetEmbedding || targetEmbedding.length === 0) {
      return NextResponse.json({ error: 'Invalid embedding data' }, { status: 400 });
    }

    // Convert similarity threshold to distance threshold
    // pgvector's <=> operator returns cosine distance (0-2), where 0 = identical, 2 = opposite
    // We want similarity >= threshold, which means distance <= (1 - threshold) * 2
    // Wait, actually for cosine similarity: distance = 1 - similarity
    // But pgvector's <=> returns cosine distance, so: distance = 1 - similarity
    const maxDistance = 1 - threshold;

    // Get confidence threshold from settings
    const confidenceThreshold = await getConfidenceThresholdFromSettings();

    // Use pgvector for efficient similarity search
    const similarFaces = await prisma.$queryRaw<Array<{
      id: string;
      boundingBox: string;
      confidence: number;
      ignored: boolean;
      personId: string | null;
      personName: string | null;
      photoId: string;
      photoFilename: string;
      distance: number;
      thumbnails: any;
      albumId: string;
      albumName: string;
      albumSlug: string;
    }>>`
      SELECT
        f.id,
        f."boundingBox",
        f.confidence,
        f.ignored,
        f."personId",
        p.name as "personName",
        ph.id as "photoId",
        ph.filename as "photoFilename",
        (f.embedding::vector <=> ${toPgvectorLiteral(targetEmbedding)}::vector) as distance,
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
        ) as thumbnails,
        a.id as "albumId",
        a.name as "albumName",
        a.slug as "albumSlug"
      FROM faces f
      JOIN photos ph ON f."photoId" = ph.id
      JOIN albums a ON ph."albumId" = a.id
      LEFT JOIN people p ON f."personId" = p.id
      WHERE f.id != ${faceId}
        AND f.embedding IS NOT NULL
        AND f.ignored = false
        AND f.confidence >= ${confidenceThreshold}
        AND (f.embedding::vector <=> ${toPgvectorLiteral(targetEmbedding)}::vector) <= ${maxDistance}
      ORDER BY (f.embedding::vector <=> ${toPgvectorLiteral(targetEmbedding)}::vector) ASC
      LIMIT ${limit}
    `;

    // Convert distance back to similarity and format results
    const formattedResults = similarFaces.map(face => ({
      id: face.id,
      boundingBox: JSON.parse(face.boundingBox),
      confidence: face.confidence,
      ignored: face.ignored,
      personId: face.personId,
      person: face.personId ? { id: face.personId, name: face.personName } : null,
      photo: {
        id: face.photoId,
        filename: face.photoFilename,
        thumbnails: face.thumbnails || [],
        album: {
          id: face.albumId,
          name: face.albumName,
          slug: face.albumSlug
        }
      },
      similarity: 1 - face.distance, // Convert distance back to similarity
    }));

    return NextResponse.json({
      similarFaces: formattedResults,
      usedThreshold: threshold,
      totalFound: formattedResults.length,
      returned: formattedResults.length
    });

  } catch (error) {
    console.error('Failed to fetch similar faces:', error);
    return NextResponse.json({ error: 'Failed to fetch similar faces' }, { status: 500 });
  }
}
