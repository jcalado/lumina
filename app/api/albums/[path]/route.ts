import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  path: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { path } = await context.params;
    
    // Decode the path parameter
    const albumPath = decodeURIComponent(path);
    
    // Get the specific album
    const parentAlbum = await prisma.album.findFirst({
      where: {
        path: albumPath,
        status: 'PUBLIC',
        enabled: true,
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
    });

    if (!parentAlbum) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    // Get direct sub-albums (albums whose path starts with this album's path + '/')
    const subAlbums = await prisma.album.findMany({
      where: {
        status: 'PUBLIC',
        enabled: true,
        path: {
          startsWith: albumPath + '/',
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

    // Filter to only direct children manually for more precise control
    const directSubAlbums = subAlbums.filter((album: any) => {
      const relativePath = album.path.substring(albumPath.length + 1);
      return !relativePath.includes('/');
    });

    // Count photos and sub-albums for each direct sub-album
    const subAlbumsWithCounts = await Promise.all(
      directSubAlbums.map(async (album: any) => {
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

    // Get photos in the current album
    const photos = await prisma.photo.findMany({
      where: {
        albumId: parentAlbum.id,
      },
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        fileSize: true,
        takenAt: true,
        createdAt: true,
        thumbnails: {
          select: {
            size: true,
            s3Key: true,
            width: true,
            height: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      album: {
        ...parentAlbum,
        photoCount: parentAlbum._count.photos,
      },
      subAlbums: subAlbumsWithCounts,
      photos,
    });
  } catch (error) {
    console.error('Error fetching album:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
