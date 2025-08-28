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

    // Build tree structure
    const buildTree = (albums: typeof albumsWithPhotos): any[] => {
      const tree: any[] = [];
      const pathMap = new Map<string, any>();

      // Sort by path to ensure parents come before children
      albums.sort((a, b) => a.path.localeCompare(b.path));

      albums.forEach(album => {
        const pathParts = album.path.split('/').filter(p => p.length > 0);
        const depth = pathParts.length - 1; // Root albums have depth 0
        const parentPath = pathParts.slice(0, -1).join('/');

        const treeNode = {
          id: album.id,
          name: album.name,
          slug: album.slug,
          path: album.path,
          totalPhotos: album.totalPhotos,
          unprocessedPhotos: album.unprocessedPhotos,
          depth,
          children: []
        };

        if (depth === 0) {
          // Root album
          tree.push(treeNode);
          pathMap.set(album.path, treeNode);
        } else {
          // Child album - find parent
          const parent = pathMap.get(parentPath);
          if (parent) {
            parent.children.push(treeNode);
            pathMap.set(album.path, treeNode);
          } else {
            // Parent not found, treat as root
            tree.push(treeNode);
            pathMap.set(album.path, treeNode);
          }
        }
      });

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
