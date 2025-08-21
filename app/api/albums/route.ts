import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pathToSlugPath } from '@/lib/slug-paths';

export async function GET() {
  try {
    // Get albums with slug field using raw query to avoid TypeScript issues
    const albums = await prisma.$queryRaw`
      SELECT 
        id,
        path,
        slug,
        name,
        description,
        createdAt,
        updatedAt,
        (SELECT COUNT(*) FROM photos WHERE albumId = albums.id) as photoCount
      FROM albums 
      WHERE status = 'PUBLIC' 
        AND enabled = 1 
        AND path NOT LIKE '%/%'
      ORDER BY name ASC
    ` as any[];

    // For each album, get additional data  
    const albumsWithCounts = await Promise.all(
      albums.map(async (album: any) => {
        // Convert photoCount to number (it comes as bigint from raw query)
        const photoCount = Number(album.photoCount);
        
        // Get sub-album photos count
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

        // Get sub-albums count
        const subAlbumsCount = await prisma.album.count({
          where: {
            status: 'PUBLIC',
            enabled: true,
            path: {
              startsWith: album.path + '/',
            },
          },
        });

        // Get 5 random photos for thumbnails from this album and its sub-albums
        let thumbnailPhotos: { id: string; filename: string }[] = [];
        
        // First try to get photos from sub-albums (more diverse)
        if (subAlbumsCount > 0) {
          const subAlbumPhotos = await prisma.photo.findMany({
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
            },
            take: 100, // Get more to randomize
            orderBy: {
              takenAt: 'asc',
            },
          });
          
          // Randomize and take 5
          if (subAlbumPhotos.length > 0) {
            const shuffled = subAlbumPhotos.sort(() => 0.5 - Math.random());
            thumbnailPhotos = shuffled.slice(0, 5);
          }
        }
        
        // If we don't have enough from sub-albums, get from the main album
        if (thumbnailPhotos.length < 5 && photoCount > 0) {
          const albumPhotos = await prisma.photo.findMany({
            where: {
              albumId: album.id,
            },
            select: {
              id: true,
              filename: true,
            },
            take: 5 - thumbnailPhotos.length,
            orderBy: {
              takenAt: 'asc',
            },
          });
          
          thumbnailPhotos.push(...albumPhotos);
        }

        return {
          ...album,
          photoCount,
          totalPhotoCount: photoCount + subAlbumPhotos,
          subAlbumsCount,
          slugPath: await pathToSlugPath(album.path),
          thumbnails: thumbnailPhotos.map(photo => ({
            photoId: photo.id,
            filename: photo.filename,
          })),
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
