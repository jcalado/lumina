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
            // Get photos distributed across the timeline for better scrubbing experience
            const totalPhotos = subAlbum._count.photos;
            let photos = [];
            
            if (totalPhotos <= 5) {
              // If 5 or fewer photos, get them all
              photos = await prisma.photo.findMany({
                where: {
                  albumId: subAlbum.id,
                },
                select: {
                  id: true,
                  filename: true,
                  takenAt: true,
                },
                orderBy: {
                  takenAt: 'asc',
                },
              });
            } else {
              // If more than 5 photos, get a distributed sample
              // Get photos at regular intervals across the timeline
              const interval = Math.floor(totalPhotos / 5);
              for (let i = 0; i < 5; i++) {
                const skip = i * interval;
                const photo = await prisma.photo.findFirst({
                  where: {
                    albumId: subAlbum.id,
                  },
                  select: {
                    id: true,
                    filename: true,
                    takenAt: true,
                  },
                  skip: skip,
                  orderBy: {
                    takenAt: 'asc',
                  },
                });
                if (photo) {
                  photos.push(photo);
                }
              }
            }
            
            // Get date range for the album
            const dateRange = await prisma.photo.aggregate({
              where: {
                albumId: subAlbum.id,
                takenAt: {
                  not: null,
                },
              },
              _min: {
                takenAt: true,
              },
              _max: {
                takenAt: true,
              },
            });
            
            (subAlbum as any).photos = photos;
            (subAlbum as any).dateRange = {
              earliest: dateRange._min.takenAt,
              latest: dateRange._max.takenAt,
            };
            console.log(`Sub-album ${subAlbum.name} has ${photos.length} distributed photos for scrubbing`);
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
        // Return all photos for scrubbing effect (up to 5)
        const photos = subAlbum.photos || [];
        
        console.log(`Sub-album ${subAlbum.name}: ${photos.length} photos available for scrubbing`);
        
        return {
          id: subAlbum.id,
          path: subAlbum.path,
          name: subAlbum.name,
          description: subAlbum.description,
          photoCount: subAlbum._count.photos,
          totalPhotoCount: subAlbum._count.photos,
          subAlbumsCount: 0, // Can be calculated if needed
          thumbnails: photos.map((photo: any) => ({
            photoId: photo.id,
            filename: photo.filename,
          })),
          dateRange: subAlbum.dateRange || null,
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
