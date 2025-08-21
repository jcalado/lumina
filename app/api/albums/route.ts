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

    // For each top-level album, also count photos in all sub-albums and get thumbnails
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

        // Get thumbnails from this album and its sub-albums for the scrub effect
        let thumbnails: { photoId: string; filename: string }[] = [];
        
        // First get photos from the main album
        const mainAlbumPhotos = await prisma.photo.findMany({
          where: {
            albumId: album.id,
          },
          select: {
            id: true,
            filename: true,
            takenAt: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
        });

        // Then get photos from sub-albums
        const subAlbumPhotosData = await prisma.photo.findMany({
          where: {
            album: {
              status: 'PUBLIC',
              enabled: true,
              path: {
                startsWith: album.path + '/',
              },
            },
          },
          select: {
            id: true,
            filename: true,
            takenAt: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
        });

        // Combine and sort all photos
        const allPhotos = [...mainAlbumPhotos, ...subAlbumPhotosData].sort((a, b) => {
          if (!a.takenAt && !b.takenAt) return 0;
          if (!a.takenAt) return 1;
          if (!b.takenAt) return -1;
          return a.takenAt.getTime() - b.takenAt.getTime();
        });

        // Get distributed sample for thumbnails (max 5 photos)
        if (allPhotos.length > 0) {
          if (allPhotos.length <= 5) {
            thumbnails = allPhotos.map(photo => ({
              photoId: photo.id,
              filename: photo.filename,
            }));
          } else {
            // Get photos at regular intervals across the timeline
            const interval = Math.floor(allPhotos.length / 5);
            for (let i = 0; i < 5; i++) {
              const index = i * interval;
              if (index < allPhotos.length) {
                thumbnails.push({
                  photoId: allPhotos[index].id,
                  filename: allPhotos[index].filename,
                });
              }
            }
          }
        }

        return {
          ...album,
          photoCount: album._count.photos,
          totalPhotoCount: album._count.photos + subAlbumPhotos,
          subAlbumsCount,
          thumbnails,
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
