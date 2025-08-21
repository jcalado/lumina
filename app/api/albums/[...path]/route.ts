import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{
    path: string[];
  }>;
}

interface SubAlbumWithPhotos {
  id: string;
  path: string;
  slug?: string;
  name: string;
  description: string | null;
  _count: {
    photos: number;
  };
  photos?: {
    id: string;
    filename: string;
    takenAt: Date | null;
  }[];
  dateRange?: {
    earliest: Date | null;
    latest: Date | null;
  } | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  let albumPath = '';
  try {
    const resolvedParams = await params;
    console.log('Raw path segments:', resolvedParams.path);
    
    // Get query parameters for sorting and pagination
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'asc'; // 'asc' or 'desc'
    const page = parseInt(searchParams.get('page') || '1');
    const limitParam = searchParams.get('limit');
    
    // Get photos per page setting from database, default to 32
    let photosPerPage = 32;
    try {
      const setting = await prisma.siteSettings.findUnique({
        where: { key: 'photosPerPage' }
      });
      if (setting) {
        photosPerPage = parseInt(setting.value);
      }
    } catch (error) {
      console.log('Using default photos per page value');
    }
    
    // Allow override via query param (for admin/testing)
    const limit = limitParam ? parseInt(limitParam) : photosPerPage;
    const offset = (page - 1) * limit;
    
    // Decode each path segment to handle URL encoding
    const decodedPath = resolvedParams.path.map(segment => decodeURIComponent(segment));
    albumPath = decodedPath.join('/');
    
    console.log('Decoded path segments:', decodedPath);
    console.log('Final album path:', albumPath);
    console.log('Sort order:', sortBy);
    console.log('Pagination:', { page, limit, offset });
    
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
            takenAt: sortBy === 'desc' ? 'desc' : 'asc',
          },
          skip: offset,
          take: limit,
        },
        _count: {
          select: {
            photos: true,
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
    let subAlbums: SubAlbumWithPhotos[] = [];
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
      subAlbums = allSubAlbums.filter((album: SubAlbumWithPhotos) => {
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
      
      // Get slugs for sub-albums (workaround for TypeScript/Prisma issue)
      for (const subAlbum of subAlbums) {
        try {
          const albumWithSlug = await prisma.$queryRaw`
            SELECT slug FROM albums WHERE id = ${subAlbum.id}
          ` as Array<{slug: string}>;
          
          if (albumWithSlug.length > 0) {
            (subAlbum as any).slug = albumWithSlug[0].slug;
          } else {
            (subAlbum as any).slug = subAlbum.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          }
        } catch (error) {
          console.error('Error fetching slug for album:', subAlbum.id, error);
          (subAlbum as any).slug = subAlbum.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
      }
      
      // Get thumbnail photos for sub-albums
      for (const subAlbum of subAlbums) {
        try {
          // First check if this sub-album has its own sub-albums
          const subAlbumHasChildren = await prisma.album.count({
            where: {
              status: 'PUBLIC',
              enabled: true,
              path: {
                startsWith: subAlbum.path + '/',
              },
            },
          });

          let photos: { id: string; filename: string; takenAt: Date | null }[] = [];
          
          if (subAlbumHasChildren > 0) {
            // This sub-album has children, so get photos from its sub-albums instead
            
            const subAlbumPhotos = await prisma.photo.findMany({
              where: {
                album: {
                  status: 'PUBLIC',
                  enabled: true,
                  path: {
                    startsWith: subAlbum.path + '/',
                  },
                },
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

            // Get distributed sample from sub-album photos
            if (subAlbumPhotos.length > 0) {
              if (subAlbumPhotos.length <= 5) {
                photos = subAlbumPhotos;
              } else {
                const interval = Math.floor(subAlbumPhotos.length / 5);
                for (let i = 0; i < 5; i++) {
                  const index = i * interval;
                  if (index < subAlbumPhotos.length) {
                    photos.push(subAlbumPhotos[index]);
                  }
                }
              }
            }
          } else if (subAlbum._count.photos > 0) {
            // No children, get photos from this album directly
            
            const totalPhotos = subAlbum._count.photos;
            
            if (totalPhotos <= 5) {
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
              // Get distributed sample from direct photos
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
          }

          // Store the photos for scrubbing
          (subAlbum as SubAlbumWithPhotos).photos = photos;
          
          // Calculate total photo count including sub-albums
          const totalPhotoCount = subAlbum._count.photos + (subAlbumHasChildren > 0 ? await prisma.photo.count({
            where: {
              album: {
                status: 'PUBLIC',
                enabled: true,
                path: {
                  startsWith: subAlbum.path + '/',
                },
              },
            },
          }) : 0);

          // Get date range for the album (including sub-albums if any)
          const dateRange = await prisma.photo.aggregate({
            where: {
              OR: [
                { albumId: subAlbum.id },
                ...(subAlbumHasChildren > 0 ? [{
                  album: {
                    status: 'PUBLIC' as const,
                    enabled: true,
                    path: {
                      startsWith: subAlbum.path + '/',
                    },
                  },
                }] : [])
              ],
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
          
          (subAlbum as SubAlbumWithPhotos).dateRange = {
            earliest: dateRange._min.takenAt || null,
            latest: dateRange._max.takenAt || null,
          };
          
          // Update the photo count to include sub-albums
          (subAlbum as SubAlbumWithPhotos)._count.photos = totalPhotoCount;
        } catch (photoError) {
          console.error('Error fetching photos for sub-album:', subAlbum.id, photoError);
          (subAlbum as SubAlbumWithPhotos).photos = [];
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
        totalPhotoCount: album._count.photos,
        subAlbumsCount: subAlbums.length,
      },
      subAlbums: await Promise.all(subAlbums.map(async (subAlbum: SubAlbumWithPhotos) => {
        // Return all photos for scrubbing effect (up to 5)
        const photos = subAlbum.photos || [];
        
        // Calculate subAlbumsCount for this sub-album
        const subAlbumsCount = await prisma.album.count({
          where: {
            status: 'PUBLIC',
            enabled: true,
            path: {
              startsWith: subAlbum.path + '/',
            },
          },
        });
        
        return {
          id: subAlbum.id,
          path: subAlbum.path,
          name: subAlbum.name,
          description: subAlbum.description,
          slug: (subAlbum as any).slug,
          photoCount: subAlbum._count.photos,
          totalPhotoCount: subAlbum._count.photos,
          subAlbumsCount,
          thumbnails: photos.map((photo) => ({
            photoId: photo.id,
            filename: photo.filename,
          })),
          dateRange: subAlbum.dateRange ? {
            earliest: subAlbum.dateRange.earliest?.toISOString() || null,
            latest: subAlbum.dateRange.latest?.toISOString() || null,
          } : null,
        };
      })),
      photos: album.photos,
      pagination: {
        page,
        limit,
        totalPhotos: album._count.photos,
        totalPages: Math.ceil(album._count.photos / limit),
        hasMore: offset + album.photos.length < album._count.photos,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching album:', error);
    console.error('Album path that failed:', albumPath);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Failed to fetch album', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
