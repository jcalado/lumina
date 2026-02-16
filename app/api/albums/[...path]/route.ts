import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { slugPathToPath, pathToSlugPath } from '@/lib/slug-paths';
import { getPhotoOrientation } from '@/lib/photo-orientation';
import { getS3Service } from '@/lib/s3';

interface Params {
  path: string[];
}

interface SubAlbumWithMedia {
  id: string;
  path: string;
  slug?: string;
  name: string;
  description: string | null;
  _count: {
    photos: number;
    videos?: number;
  };
  media?: {
    id: string;
    filename: string;
    takenAt: Date | null;
    type: 'photo' | 'video';
  }[];
  dateRange?: {
    earliest: Date | null;
    latest: Date | null;
  } | null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  let albumPath = '';
  try {
    const { path } = await context.params;

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
      // Using default photos per page value
    }

    // Allow override via query param (for admin/testing)
    const limit = limitParam ? parseInt(limitParam) : photosPerPage;
    const offset = (page - 1) * limit;

    // Decode each path segment to handle URL encoding
    const decodedPath = path.map((segment: string) => decodeURIComponent(segment));
    const slugPath = decodedPath.join('/');

    // Convert slug path back to filesystem path for database query
    const convertedPath = await slugPathToPath(slugPath);
    if (convertedPath === null) {
      return NextResponse.json(
        { error: 'Invalid album path' },
        { status: 404 }
      );
    }
    albumPath = convertedPath;

    let album;
    let albumVideos: any[] = [];

    try {
      // Try to include videos in the main query
      album = await prisma.album.findUnique({
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
          videos: {
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
              videos: true,
            },
          },
        },
      });

      if (album && (album as any).videos) {
        albumVideos = (album as any).videos;
      }
    } catch (error) {
      // Fallback: query without videos
      album = await prisma.album.findUnique({
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

      // Try to get videos separately
      if (album) {
        try {
          const videos = await prisma.video.findMany({
            where: {
              albumId: album.id,
            },
            include: {
              thumbnails: true,
            },
            orderBy: {
              takenAt: sortBy === 'desc' ? 'desc' : 'asc',
            },
            skip: offset,
            take: limit,
          });

          albumVideos = videos;
        } catch (videoError) {
          // Continue without videos if the table doesn't exist yet
        }
      }
    }

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
    let subAlbums: SubAlbumWithMedia[] = [];
    try {
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
          slug: true,
          displayOrder: true,
          _count: {
            select: {
              photos: true,
              // videos: true, // TypeScript doesn't recognize this yet, handle manually
            },
          },
        },
        orderBy: [
          { displayOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      // Filter to get only direct children and add video counts
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

      // Ensure direct children respect displayOrder and then name
      subAlbums.sort((a: any, b: any) => {
        const ao = a.displayOrder ?? 0;
        const bo = b.displayOrder ?? 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });

      // Add video counts to sub-albums (workaround for TypeScript limitations)
      for (const subAlbum of subAlbums) {
        try {
          const videoCount = await (prisma as any).video.count({
            where: {
              albumId: subAlbum.id,
            },
          });
          (subAlbum as any)._count.videos = videoCount;
        } catch (error) {
          (subAlbum as any)._count.videos = 0;
        }
      }

      // Slug already selected above; fallback if missing
      for (const subAlbum of subAlbums as any[]) {
        if (!subAlbum.slug) {
          subAlbum.slug = subAlbum.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

          let media: { id: string; filename: string; takenAt: Date | null; type: 'photo' | 'video' }[] = [];

          if (subAlbumHasChildren > 0) {
            // This sub-album has children, so get media from its sub-albums instead

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

            const subAlbumVideos = await (prisma as any).video.findMany({
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

            // Combine and sort all media by date
            const allSubAlbumMedia = [
              ...subAlbumPhotos.map(p => ({ ...p, type: 'photo' as const })),
              ...subAlbumVideos.map((v: any) => ({ ...v, type: 'video' as const }))
            ].sort((a, b) => {
              const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
              const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
              return dateA - dateB;
            });

            // Get distributed sample from sub-album media
            if (allSubAlbumMedia.length > 0) {
              if (allSubAlbumMedia.length <= 5) {
                media = allSubAlbumMedia;
              } else {
                const interval = Math.floor(allSubAlbumMedia.length / 5);
                for (let i = 0; i < 5; i++) {
                  const index = i * interval;
                  if (index < allSubAlbumMedia.length) {
                    media.push(allSubAlbumMedia[index]);
                  }
                }
              }
            }
          } else if (subAlbum._count.photos > 0 || (subAlbum._count as any).videos > 0) {
            // No children, get media from this album directly

            const directPhotos = await prisma.photo.findMany({
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

            const directVideos = await (prisma as any).video.findMany({
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

            // Combine and sort all media by date
            const allDirectMedia = [
              ...directPhotos.map(p => ({ ...p, type: 'photo' as const })),
              ...directVideos.map((v: any) => ({ ...v, type: 'video' as const }))
            ].sort((a, b) => {
              const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
              const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
              return dateA - dateB;
            });

            // Get distributed sample from direct media
            if (allDirectMedia.length <= 5) {
              media = allDirectMedia;
            } else {
              const interval = Math.floor(allDirectMedia.length / 5);
              for (let i = 0; i < 5; i++) {
                const skip = i * interval;
                if (skip < allDirectMedia.length) {
                  media.push(allDirectMedia[skip]);
                }
              }
            }
          }

          // Store the media for scrubbing
          (subAlbum as SubAlbumWithMedia).media = media;

          // Calculate total media count including sub-albums
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

          const totalVideoCount = ((subAlbum._count as any).videos || 0) + (subAlbumHasChildren > 0 ? await (prisma as any).video.count({
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
          const photoDateRange = await prisma.photo.aggregate({
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

          const videoDateRange = await (prisma as any).video.aggregate({
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

          // Combine date ranges
          const allDates = [
            photoDateRange._min.takenAt,
            photoDateRange._max.takenAt,
            videoDateRange._min.takenAt,
            videoDateRange._max.takenAt
          ].filter(Boolean);

          (subAlbum as SubAlbumWithMedia).dateRange = allDates.length > 0 ? {
            earliest: new Date(Math.min(...allDates.map(d => new Date(d!).getTime()))),
            latest: new Date(Math.max(...allDates.map(d => new Date(d!).getTime()))),
          } : null;

          // Update the counts to include videos
          (subAlbum as SubAlbumWithMedia)._count.photos = totalPhotoCount;
          (subAlbum as SubAlbumWithMedia)._count.videos = totalVideoCount;
        } catch (photoError) {
          (subAlbum as SubAlbumWithMedia).media = [];
        }
      }
    } catch (subAlbumError) {
      subAlbums = [];
    }

    // Transform the response to match the expected frontend interface
    const albumWithIncludes = album as any;
    const s3 = getS3Service();
    const response = {
      album: {
        id: album.id,
        path: album.path,
        name: album.name,
        description: album.description,
        photoCount: albumWithIncludes.photos?.length || 0,
        totalPhotoCount: albumWithIncludes._count?.photos || 0,
        subAlbumsCount: subAlbums.length,
      },
      subAlbums: await Promise.all(subAlbums.map(async (subAlbum: SubAlbumWithMedia) => {
        // Return all media for scrubbing effect (up to 5)
        const media = subAlbum.media || [];

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
          slugPath: await pathToSlugPath(subAlbum.path),
          name: subAlbum.name,
          description: subAlbum.description,
          slug: (subAlbum as any).slug,
          photoCount: subAlbum._count.photos,
          totalPhotoCount: subAlbum._count.photos,
          subAlbumsCount,
          thumbnails: media.map((mediaItem) => ({
            mediaId: mediaItem.id,
            filename: mediaItem.filename,
            mediaType: mediaItem.type,
          })),
          dateRange: subAlbum.dateRange ? {
            earliest: subAlbum.dateRange.earliest?.toISOString() || null,
            latest: subAlbum.dateRange.latest?.toISOString() || null,
          } : null,
        };
      })),
      photos: (albumWithIncludes.photos || []).map((photo: any) => ({
        ...photo,
        type: 'photo' as const,
        orientation: getPhotoOrientation(photo.metadata),
        thumbnails: (photo.thumbnails || []).map((t: any) => ({
          ...t,
          url: s3.getPublicUrl(t.s3Key),
        })),
      })),
      videos: albumVideos.map((video: any) => ({
        ...video,
        type: 'video' as const,
        thumbnails: (video.thumbnails || []).map((t: any) => ({
          ...t,
          url: s3.getPublicUrl(t.s3Key),
        })),
      })),
      // Combined media array for easier frontend handling
      media: [
        ...(albumWithIncludes.photos || []).map((photo: any) => ({
          ...photo,
          type: 'photo' as const,
          orientation: getPhotoOrientation(photo.metadata),
          thumbnails: (photo.thumbnails || []).map((t: any) => ({
            ...t,
            url: s3.getPublicUrl(t.s3Key),
          })),
        })),
        ...albumVideos.map((video: any) => ({
          ...video,
          type: 'video' as const,
          thumbnails: (video.thumbnails || []).map((t: any) => ({
            ...t,
            url: s3.getPublicUrl(t.s3Key),
          })),
        }))
      ].sort((a, b) => {
        // Sort by takenAt date, maintaining the sort order from the query
        const dateA = new Date(a.takenAt || a.createdAt);
        const dateB = new Date(b.takenAt || b.createdAt);
        return sortBy === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
      }),
      pagination: {
        page,
        limit,
        totalPhotos: albumWithIncludes._count?.photos || 0,
        totalPages: Math.ceil((albumWithIncludes._count?.photos || 0) / limit),
        hasMore: offset + (albumWithIncludes.photos?.length || 0) < (albumWithIncludes._count?.photos || 0),
      },
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch album', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
