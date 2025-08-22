import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pathToSlugPath } from '@/lib/slug-paths';

export async function GET() {
  try {
    // Single optimized query with CTEs and JOINs
    const albums = await prisma.$queryRaw`
      WITH AlbumStats AS (
        SELECT 
          a.id,
          a.path,
          a.slug,
          a.name,
          a.description,
          a.createdAt,
          a.updatedAt,
          COUNT(DISTINCT p.id) as photoCount,
          COUNT(DISTINCT CASE WHEN sub_p.albumId IS NOT NULL THEN sub_p.id END) as subAlbumPhotosCount,
          COUNT(DISTINCT CASE WHEN sub_a.id IS NOT NULL THEN sub_a.id END) as subAlbumsCount
        FROM albums a
        LEFT JOIN photos p ON p.albumId = a.id
        LEFT JOIN albums sub_a ON sub_a.path LIKE CONCAT(a.path, '/%') 
          AND sub_a.status = 'PUBLIC' 
          AND sub_a.enabled = 1
        LEFT JOIN photos sub_p ON sub_p.albumId = sub_a.id
        WHERE a.status = 'PUBLIC' 
          AND a.enabled = 1 
          AND a.path NOT LIKE '%/%'
        GROUP BY a.id, a.path, a.slug, a.name, a.description, a.createdAt, a.updatedAt
        ORDER BY a.name ASC
      )
      SELECT * FROM AlbumStats
    ` as any[];

    // Get thumbnail photos with efficient sampling
    const albumsWithThumbnails = await Promise.all(
      albums.map(async (album: any) => {
        const photoCount = Number(album.photoCount);
        const subAlbumPhotosCount = Number(album.subAlbumPhotosCount);
        const subAlbumsCount = Number(album.subAlbumsCount);
        
        // Use optimized query for thumbnails
        const thumbnails = await prisma.$queryRaw`
          (
            SELECT p.id, p.filename, 'sub' as source
            FROM photos p
            INNER JOIN albums a ON p.albumId = a.id
            WHERE a.path LIKE ${album.path + '/%'
            }
              AND a.status = 'PUBLIC'
              AND a.enabled = 1
            ORDER BY RANDOM()
            LIMIT 5
          )
          UNION ALL
          (
            SELECT id, filename, 'main' as source
            FROM photos
            WHERE albumId = ${album.id}
            ORDER BY RANDOM()
            LIMIT ${5}
          )
          LIMIT 5
        ` as { id: string; filename: string }[];
        
        return {
          ...album,
          photoCount,
          totalPhotoCount: photoCount + subAlbumPhotosCount,
          subAlbumsCount,
          slugPath: await pathToSlugPath(album.path),
          thumbnails: thumbnails.map(photo => ({
            photoId: photo.id,
            filename: photo.filename,
          })),
        };
      })
    );

    return NextResponse.json({
      albums: albumsWithThumbnails,
    });
  } catch (error) {
    console.error('Error fetching albums:', error);
    return NextResponse.json(
      { error: 'Failed to fetch albums' },
      { status: 500 }
    );
  }
}