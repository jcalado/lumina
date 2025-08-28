import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // First get albums with total photo counts
    const albums = await prisma.album.findMany({
      // Show all albums to admins regardless of status/enabled
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

    // Include all albums that have photos, plus their ancestor paths to preserve hierarchy
    const pathToAlbum = new Map(albumsWithUnprocessedCount.map(a => [a.path, a] as const));
    const includedPaths = new Set<string>();
    for (const a of albumsWithUnprocessedCount) {
      if (a.totalPhotos > 0) {
        // include this album
        includedPaths.add(a.path);
        // include ancestors by path segments
        const parts = a.path.split('/').filter(Boolean);
        for (let i = parts.length - 1; i > 0; i--) {
          const p = parts.slice(0, i).join('/');
          includedPaths.add(p);
        }
      }
    }
    const albumsWithPhotos = albumsWithUnprocessedCount.filter(a => includedPaths.has(a.path));

    // Build tree structure using exact parent path, avoid accidental prefix nesting
    const buildTree = (albums: typeof albumsWithPhotos): any[] => {
      const tree: any[] = [];
      const pathMap = new Map<string, any>();

      // Sort by path to ensure parents come before children when they exist in list
      const sorted = [...albums].sort((a, b) => a.path.localeCompare(b.path));

      for (const album of sorted) {
        const parts = album.path.split('/').filter(Boolean);
        const depth = Math.max(0, parts.length - 1);
        const parentPath = parts.slice(0, -1).join('/');

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

        // Attach to exact parent if present in list; otherwise treat as root
        const parent = parentPath ? pathMap.get(parentPath) : null;
        if (parent) {
          parent.children.push(node);
        } else {
          tree.push(node);
        }

        // Register this node for possible children
        pathMap.set(album.path, node);
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
