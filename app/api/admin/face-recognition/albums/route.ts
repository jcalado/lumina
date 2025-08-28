import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // First get albums with total photo counts
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
            photos: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Get unprocessed photos count for each album
    const albumsWithUnprocessedCount = await Promise.all(
      albums.map(async (album) => {
        const unprocessedCount = await prisma.photo.count({
          where: {
            albumId: album.id,
            faceProcessedAt: null
          }
        });

        return {
          id: album.id,
          name: album.name,
          slug: album.slug,
          path: album.path,
          totalPhotos: album._count.photos,
          unprocessedPhotos: unprocessedCount
        };
      })
    );

    // Filter out albums with no photos
    const albumsWithPhotos = albumsWithUnprocessedCount.filter(album => album.totalPhotos > 0);

    return NextResponse.json({
      albums: albumsWithPhotos
    });
  } catch (error) {
    console.error('Error fetching albums for face recognition:', error);
    return NextResponse.json(
      { error: 'Failed to fetch albums' },
      { status: 500 }
    );
  }
}
