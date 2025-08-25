import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Get unassigned faces
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get unassigned faces using raw query since TypeScript types are having issues
    const unassignedFaces = await prisma.$queryRaw`
      SELECT 
        f.id,
        f.boundingBox,
        f.confidence,
        p.id as photoId,
        p.filename,
        t.id as thumbnailId,
        t.s3Key,
        t.width,
        t.height,
        f.ignored
      FROM faces f
      JOIN photos p ON f.photoId = p.id
      LEFT JOIN thumbnails t ON p.id = t.photoId AND t.size = 'SMALL'
      WHERE f.personId IS NULL AND f.ignored = FALSE
      ORDER BY f.confidence DESC
      LIMIT ${limit}
    `;

    const formattedFaces = (unassignedFaces as any[]).map(face => ({
      id: face.id,
      boundingBox: JSON.parse(face.boundingBox),
      confidence: face.confidence,
      ignored: face.ignored === 1, // SQLite returns 1 for true, 0 for false
      photo: {
        id: face.photoId,
        filename: face.filename,
        thumbnails: face.thumbnailId ? [{
          id: face.thumbnailId,
          photoId: face.photoId,
          size: 'SMALL',
          s3Key: face.s3Key,
          width: face.width,
          height: face.height,
        }] : [],
      },
    }));

    return NextResponse.json({
      unassignedFaces: formattedFaces,
      count: formattedFaces.length,
    });

  } catch (error) {
    console.error('Error fetching unassigned faces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unassigned faces' },
      { status: 500 }
    );
  }
}
