import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Single comprehensive query to get everything at once
    const result = await prisma.$queryRaw`
      WITH AlbumStats AS (
        SELECT 
          a.id,
          a.path,
          a.slug,
          a.name,
          a.description,
          a."displayOrder",
          a."createdAt",
          a."updatedAt",
          (SELECT COUNT(*) FROM photos WHERE "albumId" = a.id) as photoCount,
          (SELECT COUNT(*) FROM photos p2 
           INNER JOIN albums a2 ON p2."albumId" = a2.id 
           WHERE a2.path LIKE a.path || '/%' 
             AND a2.status = 'PUBLIC' 
             AND a2.enabled = true) as subAlbumPhotosCount,
          (SELECT COUNT(*) FROM albums a3 
           WHERE a3.path LIKE a.path || '/%' 
             AND a3.status = 'PUBLIC' 
             AND a3.enabled = true) as subAlbumsCount
        FROM albums a
        WHERE a.status = 'PUBLIC' 
          AND a.enabled = true 
          AND a.path NOT LIKE '%/%'
      ),
      AlbumThumbnails AS (
        SELECT 
          parent.id as parentAlbumId,
          p.id as mediaId,
          p.filename,
          'photo' as mediaType,
          p."takenAt",
          ROW_NUMBER() OVER (PARTITION BY parent.id ORDER BY p."takenAt" ASC) as rn
        FROM AlbumStats parent
        LEFT JOIN albums sub ON sub.path LIKE parent.path || '/%' 
          AND sub.status = 'PUBLIC' 
          AND sub.enabled = true
        LEFT JOIN photos p ON (p."albumId" = parent.id OR p."albumId" = sub.id)
        WHERE p.id IS NOT NULL
        
        UNION ALL
        
        SELECT 
          parent.id as parentAlbumId,
          v.id as mediaId,
          v.filename,
          'video' as mediaType,
          v."takenAt",
          ROW_NUMBER() OVER (PARTITION BY parent.id ORDER BY v."takenAt" ASC) as rn
        FROM AlbumStats parent
        LEFT JOIN albums sub ON sub.path LIKE parent.path || '/%' 
          AND sub.status = 'PUBLIC' 
          AND sub.enabled = true
        LEFT JOIN videos v ON (v."albumId" = parent.id OR v."albumId" = sub.id)
        WHERE v.id IS NOT NULL
      ),
      RankedThumbnails AS (
        SELECT 
          parentAlbumId,
          mediaId,
          filename,
          mediaType,
          ROW_NUMBER() OVER (PARTITION BY parentAlbumId ORDER BY "takenAt" ASC) as final_rn
        FROM AlbumThumbnails
      )
      SELECT 
        a.*,
        COALESCE(t.thumbnails, '') as thumbnails
      FROM AlbumStats a
      LEFT JOIN (
        SELECT 
          parentAlbumId,
          STRING_AGG(mediaId || '|||' || filename || '|||' || mediaType, ';;;') as thumbnails
        FROM RankedThumbnails 
        WHERE final_rn <= 5
        GROUP BY parentAlbumId
      ) t ON t.parentAlbumId = a.id
      ORDER BY COALESCE(a."displayOrder", 0) ASC, a.name ASC
    ` as any[];

    // Process the results
    const albums = result.map((album: any) => {
      // Parse thumbnails from GROUP_CONCAT format
      let thumbnails = [];
      if (album.thumbnails) {
        thumbnails = album.thumbnails.split(';;;').map((item: string) => {
          const [mediaId, filename, mediaType] = item.split('|||');
          return { mediaId, filename, mediaType };
        });
      }

      return {
        id: album.id,
        path: album.path,
        slug: album.slug,
        name: album.name,
        description: album.description,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt,
        photoCount: Number(album.photoCount),
        subAlbumPhotosCount: Number(album.subAlbumPhotosCount),
        subAlbumsCount: Number(album.subAlbumsCount),
        totalPhotoCount: Number(album.photoCount) + Number(album.subAlbumPhotosCount),
        slugPath: album.slug, // Use existing slug instead of converting
        thumbnails,
      };
    });

    return NextResponse.json({
      albums,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch albums', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
