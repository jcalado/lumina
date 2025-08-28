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
        path: 'asc'
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

    // Build tree structure using longest existing path prefix as parent (like Album Management)
    const buildTree = (albums: typeof albumsWithPhotos): any[] => {
      const tree: any[] = [];
      const nodesById = new Map<string, any>();

      // Sort by path depth, then by path for deterministic parent resolution
      const sorted = [...albums].sort((a, b) => {
        const depthA = a.path.split('/').length;
        const depthB = b.path.split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.path.localeCompare(b.path);
      });

      for (const album of sorted) {
        const depth = Math.max(0, album.path.split('/').length - 1);
        const node = {
          id: album.id,
          name: album.name,
          slug: album.slug,
          path: album.path,
          totalPhotos: album.totalPhotos,
          unprocessedPhotos: album.unprocessedPhotos,
          depth,
          children: [] as any[]
        };
        nodesById.set(album.id, node);

        // Find the parent as the album with the longest path that is a prefix of this path
        let parent: any | null = null;
        let maxLen = -1;
        for (const candidate of nodesById.values()) {
          if (candidate.path === album.path) continue;
          if (album.path.startsWith(candidate.path + '/')) {
            if (candidate.path.length > maxLen) {
              maxLen = candidate.path.length;
              parent = candidate;
            }
          }
        }

        if (parent) {
          parent.children.push(node);
        } else {
          tree.push(node);
        }
      }

      return tree;
    };

    const albumTree = buildTree(albumsWithPhotos);

    return NextResponse.json({
      albums: albumTree
    });
  } catch (error) {
    console.error('Error fetching albums for face recognition:', error);
    return NextResponse.json(
      { error: 'Failed to fetch albums' },
      { status: 500 }
    );
  }
}
