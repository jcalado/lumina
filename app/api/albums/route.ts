import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

        return {
          ...album,
          photoCount,
          totalPhotoCount: photoCount + subAlbumPhotos,
          subAlbumsCount,
          thumbnails: [], // Simplified for now
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
