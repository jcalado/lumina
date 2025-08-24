import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pathToSlugPath } from '@/lib/slug-paths';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ albums: [] });
    }

    const searchTerm = query.trim().toLowerCase();

    // Search albums by name, description, or path using raw SQL for case-insensitive search
    // with relevance scoring
    const albums = await prisma.$queryRaw`
      SELECT 
        id, path, slug, name, description, createdAt, updatedAt,
        (SELECT COUNT(*) FROM photos WHERE albumId = albums.id) as photoCount,
        CASE 
          WHEN LOWER(name) = LOWER(${searchTerm}) THEN 100
          WHEN LOWER(name) LIKE LOWER(${searchTerm} || '%') THEN 90
          WHEN LOWER(name) LIKE LOWER('%' || ${searchTerm} || '%') THEN 80
          WHEN LOWER(description) LIKE LOWER(${searchTerm} || '%') THEN 70
          WHEN LOWER(description) LIKE LOWER('%' || ${searchTerm} || '%') THEN 60
          WHEN LOWER(path) LIKE LOWER('%' || ${searchTerm} || '%') THEN 50
          ELSE 0
        END as relevance
      FROM albums 
      WHERE status = 'PUBLIC' 
        AND enabled = 1 
        AND (
          LOWER(name) LIKE LOWER('%' || ${searchTerm} || '%') OR
          LOWER(description) LIKE LOWER('%' || ${searchTerm} || '%') OR
          LOWER(path) LIKE LOWER('%' || ${searchTerm} || '%')
        )
      ORDER BY relevance DESC, name ASC 
      LIMIT 10
    ` as any[];

    // Transform the results to include additional metadata
    const searchResults = await Promise.all(albums.map(async (album: any) => {
      // Convert the path to proper slug path for navigation
      const slugPath = await pathToSlugPath(album.path);
      
      return {
        id: album.id,
        path: album.path,
        slug: album.slug,
        name: album.name,
        description: album.description,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt,
        photoCount: Number(album.photoCount),
        isSubAlbum: album.path.includes('/'),
        slugPath: slugPath
      };
    }));

    return NextResponse.json({
      albums: searchResults,
      query: searchTerm
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Failed to search albums', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
