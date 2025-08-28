import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const albums = await prisma.album.findMany({
      where: {
        enabled: true,
        status: 'PUBLIC'
      },
      select: {
        id: true,
        name: true,
        slug: true,
        path: true,
        _count: {
          select: {
            photos: {
              where: {
                faceProcessedAt: null
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json({
      albums: albums.map(album => ({
        id: album.id,
        name: album.name,
        slug: album.slug,
        path: album.path,
        unprocessedPhotos: album._count.photos
      }))
    });
  } catch (error) {
    console.error('Error fetching albums for face recognition:', error);
    return NextResponse.json(
      { error: 'Failed to fetch albums' },
      { status: 500 }
    );
  }
}
