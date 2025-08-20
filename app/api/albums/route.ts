import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Only get top-level albums (albums that don't contain a slash in their path)
    const albums = await prisma.album.findMany({
      where: {
        status: 'PUBLIC',
        enabled: true,
        path: {
          not: {
            contains: '/',
          },
        },
      },
      select: {
        id: true,
        path: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            photos: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // For each top-level album, also count photos in all sub-albums
    const albumsWithCounts = await Promise.all(
      albums.map(async (album: any) => {
        // Count photos in sub-albums (albums whose path starts with this album's path)
        const subAlbumPhotos = await prisma.photo.count({
          where: {
            album: {
              status: 'PUBLIC',
              enabled: true,
              path: {
                startsWith: album.path + '/',
              },
            },
          },
        });

        // Also check for sub-albums
        const subAlbumsCount = await prisma.album.count({
          where: {
            status: 'PUBLIC',
            enabled: true,
            path: {
              startsWith: album.path + '/',
            },
          },
        });

        return {
          ...album,
          photoCount: album._count.photos,
          totalPhotoCount: album._count.photos + subAlbumPhotos,
          subAlbumsCount,
        };
      })
    );

    return NextResponse.json({
      albums: albumsWithCounts,
    });
  } catch (error) {
    console.error('Error fetching albums:', error);
    return NextResponse.json(
      { error: 'Failed to fetch albums' },
      { status: 500 }
    );
  }
}
