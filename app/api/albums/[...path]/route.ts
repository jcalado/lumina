import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{
    path: string[];
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    console.log('Raw path segments:', resolvedParams.path);
    
    // Decode each path segment to handle URL encoding
    const decodedPath = resolvedParams.path.map(segment => decodeURIComponent(segment));
    const albumPath = decodedPath.join('/');
    
    console.log('Decoded path segments:', decodedPath);
    console.log('Final album path:', albumPath);
    
    const album = await prisma.album.findUnique({
      where: {
        path: albumPath,
      },
      include: {
        photos: {
          include: {
            thumbnails: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
        },
      },
    });

    if (!album) {
      return NextResponse.json(
        { error: 'Album not found' },
        { status: 404 }
      );
    }

    if (album.status === 'PRIVATE' || !album.enabled) {
      return NextResponse.json(
        { error: 'Album not accessible' },
        { status: 403 }
      );
    }

    // Get sub-albums (albums whose path starts with this album's path + '/')
    const subAlbums = await prisma.album.findMany({
      where: {
        status: 'PUBLIC',
        enabled: true,
        path: {
          startsWith: albumPath + '/',
          not: albumPath, // Exclude the current album
        },
      },
      select: {
        id: true,
        path: true,
        name: true,
        description: true,
        _count: {
          select: {
            photos: true,
          },
        },
      },
    });

    // Transform the response to match the expected frontend interface
    const response = {
      album: {
        id: album.id,
        path: album.path,
        name: album.name,
        description: album.description,
        photoCount: album.photos.length,
        totalPhotoCount: album.photos.length, // Can be calculated differently if needed
        subAlbumsCount: subAlbums.length,
      },
      subAlbums: subAlbums.map((subAlbum: any) => ({
        id: subAlbum.id,
        path: subAlbum.path,
        name: subAlbum.name,
        description: subAlbum.description,
        photoCount: subAlbum._count.photos,
        totalPhotoCount: subAlbum._count.photos,
        subAlbumsCount: 0, // Can be calculated if needed
      })),
      photos: album.photos,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching album:', error);
    return NextResponse.json(
      { error: 'Failed to fetch album' },
      { status: 500 }
    );
  }
}
