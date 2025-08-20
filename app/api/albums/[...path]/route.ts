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
    let subAlbums = [];
    try {
      console.log('Searching for sub-albums of:', albumPath);
      
      // Find direct sub-albums only (not nested deeper)
      const allSubAlbums = await prisma.album.findMany({
        where: {
          status: 'PUBLIC',
          enabled: true,
          NOT: {
            path: albumPath, // Exclude the current album
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
      
      // Filter to get only direct children
      subAlbums = allSubAlbums.filter((album: any) => {
        if (albumPath === '') {
          // For root albums, get albums that don't contain '/'
          return !album.path.includes('/');
        } else {
          // For sub-albums, get albums that start with current path + '/' and have no additional '/'
          const expectedPrefix = albumPath + '/';
          if (!album.path.startsWith(expectedPrefix)) {
            return false;
          }
          const remainingPath = album.path.substring(expectedPrefix.length);
          return !remainingPath.includes('/'); // No deeper nesting
        }
      });
      
      console.log('Found direct sub-albums:', subAlbums.length);
      
      // Get thumbnail photos for sub-albums that have photos
      for (const subAlbum of subAlbums) {
        if (subAlbum._count.photos > 0) {
          try {
            const photos = await prisma.photo.findMany({
              where: {
                albumId: subAlbum.id,
              },
              select: {
                id: true,
                filename: true,
              },
              take: 5,
              orderBy: {
                takenAt: 'asc',
              },
            });
            (subAlbum as any).photos = photos;
            console.log(`Sub-album ${subAlbum.name} has ${photos.length} photos`);
          } catch (photoError) {
            console.error('Error fetching photos for sub-album:', subAlbum.id, photoError);
            (subAlbum as any).photos = [];
          }
        } else {
          (subAlbum as any).photos = [];
        }
      }
    } catch (subAlbumError) {
      console.error('Error fetching sub-albums:', subAlbumError);
      subAlbums = [];
    }

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
      subAlbums: subAlbums.map((subAlbum: any) => {
        // Select a random photo for thumbnail if available
        const randomPhoto = subAlbum.photos && subAlbum.photos.length > 0 
          ? subAlbum.photos[Math.floor(Math.random() * subAlbum.photos.length)]
          : null;
        
        console.log(`Sub-album ${subAlbum.name}: ${subAlbum.photos?.length || 0} photos, random photo:`, randomPhoto?.id);
        
        return {
          id: subAlbum.id,
          path: subAlbum.path,
          name: subAlbum.name,
          description: subAlbum.description,
          photoCount: subAlbum._count.photos,
          totalPhotoCount: subAlbum._count.photos,
          subAlbumsCount: 0, // Can be calculated if needed
          thumbnail: randomPhoto ? {
            photoId: randomPhoto.id,
            filename: randomPhoto.filename,
          } : null,
        };
      }),
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
