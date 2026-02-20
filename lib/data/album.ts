import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { getPhotoOrientation } from '@/lib/photo-orientation';
import { buildSlugPathFromMap } from '@/lib/slug-paths';
import type {
  AlbumPageData,
  BreadcrumbItem,
  PhotoData,
  VideoData,
  MediaItem,
  SubAlbumData,
  ThumbnailData,
} from '@/lib/types/album';

/**
 * Server-side data fetching for album pages.
 *
 * Replaces the client-side API route with direct Prisma calls, batched
 * sub-album queries (N+1 eliminated), inline breadcrumbs, and direct
 * S3 URLs embedded in thumbnail data.
 */
export async function getAlbumPageData(
  slugPath: string,
  options?: { sortBy?: 'asc' | 'desc'; page?: number; limit?: number }
): Promise<AlbumPageData | null> {
  const s3 = getS3Service();
  const sortBy = options?.sortBy ?? 'asc';

  // ---------------------------------------------------------------
  // 1. Resolve slug path segments to filesystem path + breadcrumbs
  // ---------------------------------------------------------------
  const slugSegments = slugPath ? slugPath.split('/') : [];
  const breadcrumbs: BreadcrumbItem[] = [];
  const ancestorSlugByPath = new Map<string, string>();
  let albumPath = '';

  for (let i = 0; i < slugSegments.length; i++) {
    const currentSlug = slugSegments[i];
    const parentPath = albumPath;

    const albums = await prisma.$queryRaw`
      SELECT path, name, slug FROM albums
      WHERE slug = ${currentSlug}
      AND path LIKE ${parentPath ? `${parentPath}/%` : '%'}
      AND path NOT LIKE ${parentPath ? `${parentPath}/%/%` : '%/%'}
    ` as Array<{ path: string; name: string; slug: string }>;

    const match = albums.find((a) => {
      const depth = a.path.split('/').length;
      const expected = parentPath ? parentPath.split('/').length + 1 : 1;
      return depth === expected;
    });

    if (!match) return null;

    albumPath = match.path;
    ancestorSlugByPath.set(match.path, match.slug);
    const slugSoFar = slugSegments.slice(0, i + 1).join('/');
    breadcrumbs.push({ name: match.name, href: `/albums/${slugSoFar}` });
  }

  // ---------------------------------------------------------------
  // 2. Fetch site settings for pagination defaults
  // ---------------------------------------------------------------
  let photosPerPage = 32;
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'photosPerPage' },
    });
    if (setting) photosPerPage = parseInt(setting.value, 10);
  } catch {
    /* use default */
  }

  const limit = options?.limit || photosPerPage;
  const page = options?.page || 1;
  const offset = (page - 1) * limit;

  // ---------------------------------------------------------------
  // 3. Fetch main album with paginated photos and videos
  // ---------------------------------------------------------------
  const album = await prisma.album.findUnique({
    where: { path: albumPath },
    select: {
      id: true,
      path: true,
      slug: true,
      name: true,
      description: true,
      status: true,
      enabled: true,
      coverPhotoId: true,
    },
  });

  if (!album) return null;
  if (album.status === 'PRIVATE' || !album.enabled) return null;

  // Photos (paginated)
  const [albumPhotos, totalPhotoCount] = await Promise.all([
    prisma.photo.findMany({
      where: { albumId: album.id },
      include: { thumbnails: true },
      orderBy: { takenAt: sortBy === 'desc' ? 'desc' : 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.photo.count({ where: { albumId: album.id } }),
  ]);

  // Videos (paginated) — defensive
  let albumVideos: any[] = [];
  let totalVideoCount = 0;
  try {
    const [vids, vidCount] = await Promise.all([
      prisma.video.findMany({
        where: { albumId: album.id },
        include: { thumbnails: true },
        orderBy: { takenAt: sortBy === 'desc' ? 'desc' : 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.video.count({ where: { albumId: album.id } }),
    ]);
    albumVideos = vids;
    totalVideoCount = vidCount;
  } catch {
    /* videos table may not exist yet */
  }

  // ---------------------------------------------------------------
  // 4. Transform thumbnails with S3 URLs
  // ---------------------------------------------------------------
  function mapPhotoThumbnails(
    thumbnails: Array<{ size: string; s3Key: string; width: number; height: number }>
  ): ThumbnailData[] {
    return thumbnails.map((t) => ({
      size: t.size,
      s3Key: t.s3Key,
      url: s3.getPublicUrl(t.s3Key),
      width: t.width,
      height: t.height,
    }));
  }

  const photos: PhotoData[] = albumPhotos.map((p) => ({
    id: p.id,
    filename: p.filename,
    originalPath: p.originalPath,
    s3Key: p.s3Key,
    fileSize: p.fileSize,
    takenAt: p.takenAt ? p.takenAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    blurhash: p.blurhash,
    orientation: getPhotoOrientation(p.metadata),
    metadata: p.metadata,
    thumbnails: mapPhotoThumbnails(p.thumbnails),
  }));

  const videos: VideoData[] = albumVideos.map((v: any) => ({
    id: v.id,
    filename: v.filename,
    originalPath: v.originalPath,
    s3Key: v.s3Key,
    fileSize: v.fileSize,
    takenAt: v.takenAt ? v.takenAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    duration: v.duration ?? null,
    width: v.width ?? null,
    height: v.height ?? null,
    codec: v.codec ?? null,
    metadata: v.metadata ?? null,
    thumbnails: mapPhotoThumbnails(v.thumbnails ?? []),
  }));

  // Combined media sorted by date
  const media: MediaItem[] = [
    ...photos.map((p) => ({ ...p, type: 'photo' as const })),
    ...videos.map((v) => ({ ...v, type: 'video' as const })),
  ].sort((a, b) => {
    const dateA = new Date(a.takenAt || a.createdAt).getTime();
    const dateB = new Date(b.takenAt || b.createdAt).getTime();
    return sortBy === 'desc' ? dateB - dateA : dateA - dateB;
  });

  // ---------------------------------------------------------------
  // 5. Batch sub-album queries (THE KEY OPTIMIZATION)
  // ---------------------------------------------------------------

  // Pass 1 — All descendants in ONE query
  const descendantWhere: any = {
    status: 'PUBLIC' as const,
    enabled: true,
    NOT: { path: albumPath },
  };
  if (albumPath !== '') {
    descendantWhere.path = { startsWith: albumPath + '/' };
  }

  const allDescendants = await prisma.album.findMany({
    where: descendantWhere,
    select: {
      id: true,
      path: true,
      name: true,
      slug: true,
      description: true,
      displayOrder: true,
      coverPhotoId: true,
      _count: { select: { photos: true } },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });

  // Filter to direct children in JS
  const directChildren = allDescendants.filter((a) => {
    if (albumPath === '') return !a.path.includes('/');
    const prefix = albumPath + '/';
    return a.path.startsWith(prefix) && !a.path.substring(prefix.length).includes('/');
  });

  // Sort direct children by displayOrder then name
  directChildren.sort((a, b) => {
    const ao = a.displayOrder ?? 0;
    const bo = b.displayOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  const directChildIds = directChildren.map((a) => a.id);
  const allDescendantIds = allDescendants.map((a) => a.id);

  // Pass 2 — Batch metadata queries
  let videoCounts: Array<{ albumId: string; _count: number }> = [];
  let descendantPhotoCounts: Array<{ albumId: string; _count: number }> = [];
  let descendantVideoCounts: Array<{ albumId: string; _count: number }> = [];
  let photoDateRanges: Array<{
    albumId: string;
    _min: { takenAt: Date | null };
    _max: { takenAt: Date | null };
  }> = [];
  let videoDateRanges: Array<{
    albumId: string;
    _min: { takenAt: Date | null };
    _max: { takenAt: Date | null };
  }> = [];
  let samplePhotos: Array<{
    id: string;
    albumId: string;
    filename: string;
    takenAt: Date | null;
  }> = [];
  let sampleVideos: Array<{
    id: string;
    albumId: string;
    filename: string;
    takenAt: Date | null;
  }> = [];

  if (directChildIds.length > 0) {
    const batchResults = await Promise.all([
      // 0: Video counts for direct children
      prisma.video
        .groupBy({
          by: ['albumId'],
          _count: true,
          where: { albumId: { in: directChildIds } },
        })
        .catch(() => [] as any[]),

      // 1: Photo counts for ALL descendants
      prisma.photo.groupBy({
        by: ['albumId'],
        _count: true,
        where: { albumId: { in: allDescendantIds } },
      }),

      // 2: Video counts for ALL descendants
      prisma.video
        .groupBy({
          by: ['albumId'],
          _count: true,
          where: { albumId: { in: allDescendantIds } },
        })
        .catch(() => [] as any[]),

      // 3: Photo date ranges for descendants
      prisma.photo.groupBy({
        by: ['albumId'],
        _min: { takenAt: true },
        _max: { takenAt: true },
        where: { albumId: { in: allDescendantIds }, takenAt: { not: null } },
      }),

      // 4: Video date ranges for descendants
      prisma.video
        .groupBy({
          by: ['albumId'],
          _min: { takenAt: true },
          _max: { takenAt: true },
          where: { albumId: { in: allDescendantIds }, takenAt: { not: null } },
        })
        .catch(() => [] as any[]),

      // 5: Sample photos (all media from descendants + direct children for thumbnails)
      prisma.photo.findMany({
        where: { albumId: { in: allDescendantIds } },
        select: {
          id: true,
          albumId: true,
          filename: true,
          takenAt: true,
          thumbnails: {
            where: { size: 'MEDIUM' },
            select: { s3Key: true },
            take: 1,
          },
        },
        orderBy: { takenAt: 'asc' },
      }),

      // 6: Sample videos
      prisma.video
        .findMany({
          where: { albumId: { in: allDescendantIds } },
          select: {
            id: true,
            albumId: true,
            filename: true,
            takenAt: true,
            thumbnails: {
              where: { size: 'MEDIUM' },
              select: { s3Key: true },
              take: 1,
            },
          },
          orderBy: { takenAt: 'asc' },
        })
        .catch(() => [] as any[]),
    ]);

    videoCounts = batchResults[0] as any;
    descendantPhotoCounts = batchResults[1] as any;
    descendantVideoCounts = batchResults[2] as any;
    photoDateRanges = batchResults[3] as any;
    videoDateRanges = batchResults[4] as any;
    samplePhotos = batchResults[5] as any;
    sampleVideos = batchResults[6] as any;
  }

  // Build lookup maps for O(1) access
  const videoCountMap = new Map<string, number>();
  for (const vc of videoCounts) {
    videoCountMap.set(vc.albumId, vc._count);
  }

  const photoCountMap = new Map<string, number>();
  for (const pc of descendantPhotoCounts) {
    photoCountMap.set(pc.albumId, pc._count);
  }

  const vidCountMap = new Map<string, number>();
  for (const vc of descendantVideoCounts) {
    vidCountMap.set(vc.albumId, vc._count);
  }

  const photoDateMap = new Map<string, { min: Date | null; max: Date | null }>();
  for (const pd of photoDateRanges) {
    photoDateMap.set(pd.albumId, { min: pd._min.takenAt, max: pd._max.takenAt });
  }

  const videoDateMap = new Map<string, { min: Date | null; max: Date | null }>();
  for (const vd of videoDateRanges) {
    videoDateMap.set(vd.albumId, { min: vd._min.takenAt, max: vd._max.takenAt });
  }

  // Group sample media by albumId
  const photosByAlbum = new Map<string, typeof samplePhotos>();
  for (const p of samplePhotos) {
    const arr = photosByAlbum.get(p.albumId) || [];
    arr.push(p);
    photosByAlbum.set(p.albumId, arr);
  }

  const videosByAlbum = new Map<string, typeof sampleVideos>();
  for (const v of sampleVideos) {
    const arr = videosByAlbum.get(v.albumId) || [];
    arr.push(v);
    videosByAlbum.set(v.albumId, arr);
  }

  // Build a map from album path to slug for fast slug-path construction
  const slugByPath = new Map<string, string>();
  // Include ancestor and current album slugs (resolved during breadcrumb building)
  for (const [path, slug] of ancestorSlugByPath) {
    slugByPath.set(path, slug);
  }
  for (const desc of allDescendants) {
    slugByPath.set(desc.path, desc.slug);
  }


  // Helper: get all descendant IDs that belong to a child's subtree
  function getSubtreeIds(childPath: string): string[] {
    return allDescendants
      .filter((a) => a.path === childPath || a.path.startsWith(childPath + '/'))
      .map((a) => a.id);
  }

  // Helper: pick up to N evenly distributed samples from an array
  function pickDistributedSamples<T>(items: T[], count: number): T[] {
    if (items.length <= count) return items;
    const result: T[] = [];
    const interval = Math.floor(items.length / count);
    for (let i = 0; i < count; i++) {
      const index = i * interval;
      if (index < items.length) {
        result.push(items[index]);
      }
    }
    return result;
  }

  // Batch-fetch cover photo thumbnails for children that have coverPhotoId set
  const coverPhotoIds = directChildren
    .map((c) => c.coverPhotoId)
    .filter((id): id is string => id !== null);
  const coverPhotoThumbnailMap = new Map<string, string>();
  if (coverPhotoIds.length > 0) {
    const coverPhotos = await prisma.photo.findMany({
      where: { id: { in: coverPhotoIds } },
      select: {
        id: true,
        filename: true,
        thumbnails: { where: { size: 'MEDIUM' }, select: { s3Key: true }, take: 1 },
      },
    });
    for (const cp of coverPhotos) {
      const s3Key = cp.thumbnails[0]?.s3Key;
      if (s3Key) {
        coverPhotoThumbnailMap.set(cp.id, s3Key);
      }
    }
  }

  // ---------------------------------------------------------------
  // 6. Build SubAlbumData for each direct child
  // ---------------------------------------------------------------
  const subAlbums: SubAlbumData[] = directChildren.map((child) => {
    const subtreeIds = getSubtreeIds(child.path);

    // Sub-albums count: descendants within this child's tree (excluding the child itself)
    const subAlbumsCount = allDescendants.filter(
      (a) => a.path.startsWith(child.path + '/') && a.path !== child.path
    ).length;

    // Total photo count: child's own + all descendants in its subtree
    let childTotalPhotos = child._count.photos;
    for (const sid of subtreeIds) {
      if (sid !== child.id) {
        childTotalPhotos += photoCountMap.get(sid) || 0;
      }
    }

    // Total video count
    let childTotalVideos = videoCountMap.get(child.id) || 0;
    for (const sid of subtreeIds) {
      if (sid !== child.id) {
        childTotalVideos += vidCountMap.get(sid) || 0;
      }
    }

    // Date range: min/max across entire subtree
    const allDates: Date[] = [];
    for (const sid of subtreeIds) {
      const pd = photoDateMap.get(sid);
      if (pd?.min) allDates.push(new Date(pd.min));
      if (pd?.max) allDates.push(new Date(pd.max));
      const vd = videoDateMap.get(sid);
      if (vd?.min) allDates.push(new Date(vd.min));
      if (vd?.max) allDates.push(new Date(vd.max));
    }

    let dateRange: SubAlbumData['dateRange'] = null;
    if (allDates.length > 0) {
      const timestamps = allDates.map((d) => d.getTime());
      dateRange = {
        earliest: new Date(Math.min(...timestamps)).toISOString(),
        latest: new Date(Math.max(...timestamps)).toISOString(),
      };
    }

    // Collect all media from the child's subtree for thumbnail sampling
    const subtreePhotos: Array<{
      id: string;
      filename: string;
      takenAt: Date | null;
      type: 'photo';
      thumbnailS3Key?: string;
    }> = [];
    const subtreeVideos: Array<{
      id: string;
      filename: string;
      takenAt: Date | null;
      type: 'video';
      thumbnailS3Key?: string;
    }> = [];

    for (const sid of subtreeIds) {
      const ps = photosByAlbum.get(sid);
      if (ps) {
        for (const p of ps) {
          subtreePhotos.push({
            id: p.id,
            filename: p.filename,
            takenAt: p.takenAt,
            type: 'photo',
            thumbnailS3Key: (p as any).thumbnails?.[0]?.s3Key,
          });
        }
      }
      const vs = videosByAlbum.get(sid);
      if (vs) {
        for (const v of vs) {
          subtreeVideos.push({
            id: v.id,
            filename: v.filename,
            takenAt: v.takenAt,
            type: 'video',
            thumbnailS3Key: (v as any).thumbnails?.[0]?.s3Key,
          });
        }
      }
    }

    // Combine and sort by date, then pick distributed samples
    const allMedia = [...subtreePhotos, ...subtreeVideos].sort((a, b) => {
      const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
      const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
      return dateA - dateB;
    });

    const samples = pickDistributedSamples(allMedia, 5);

    let thumbnails: SubAlbumData['thumbnails'] = samples.map((s) => ({
      mediaId: s.id,
      filename: s.filename,
      mediaType: s.type,
      thumbnailUrl: s.thumbnailS3Key ? s3.getPublicUrl(s.thumbnailS3Key) : undefined,
    }));

    // If cover photo is set, place it first in thumbnails
    if (child.coverPhotoId) {
      const coverS3Key = coverPhotoThumbnailMap.get(child.coverPhotoId);
      if (coverS3Key) {
        // Remove cover photo from samples if already present, then prepend
        thumbnails = thumbnails.filter((t) => t.mediaId !== child.coverPhotoId);
        thumbnails.unshift({
          mediaId: child.coverPhotoId,
          filename: 'cover',
          mediaType: 'photo',
          thumbnailUrl: s3.getPublicUrl(coverS3Key),
        });
        // Keep max 5 thumbnails
        if (thumbnails.length > 5) thumbnails = thumbnails.slice(0, 5);
      }
    }

    return {
      id: child.id,
      path: child.path,
      slugPath: buildSlugPathFromMap(child.path, slugByPath),
      name: child.name,
      description: child.description,
      photoCount: child._count.photos + (videoCountMap.get(child.id) || 0),
      totalPhotoCount: childTotalPhotos + childTotalVideos,
      subAlbumsCount,
      thumbnails,
      dateRange,
    };
  });

  // ---------------------------------------------------------------
  // 7. Compute album-level total photo count (own + all descendants)
  // ---------------------------------------------------------------
  let albumTotalPhotos = totalPhotoCount;
  let albumTotalVideos = totalVideoCount;
  for (const desc of allDescendants) {
    albumTotalPhotos += photoCountMap.get(desc.id) || 0;
    albumTotalVideos += vidCountMap.get(desc.id) || 0;
  }

  // ---------------------------------------------------------------
  // 8. Resolve OG image: coverPhotoId → first photo → first descendant photo
  // ---------------------------------------------------------------
  let ogImageUrl: string | null = null;
  if (album.coverPhotoId) {
    const coverPhoto = await prisma.photo.findUnique({
      where: { id: album.coverPhotoId },
      select: { thumbnails: { where: { size: 'LARGE' }, select: { s3Key: true }, take: 1 } },
    });
    const key = coverPhoto?.thumbnails[0]?.s3Key;
    if (key) ogImageUrl = s3.getPublicUrl(key);
  }
  if (!ogImageUrl && photos.length > 0) {
    const largeThumbnail = photos[0].thumbnails.find((t) => t.size === 'LARGE');
    const medThumbnail = photos[0].thumbnails.find((t) => t.size === 'MEDIUM');
    ogImageUrl = largeThumbnail?.url || medThumbnail?.url || null;
  }
  if (!ogImageUrl && subAlbums.length > 0) {
    const firstThumb = subAlbums[0].thumbnails[0];
    if (firstThumb?.thumbnailUrl) ogImageUrl = firstThumb.thumbnailUrl;
  }

  // ---------------------------------------------------------------
  // 9. Return AlbumPageData
  // ---------------------------------------------------------------
  const totalMedia = totalPhotoCount + totalVideoCount;

  return {
    album: {
      id: album.id,
      path: album.path,
      slugPath: slugPath || '',
      name: album.name,
      description: album.description,
      photoCount: totalPhotoCount + totalVideoCount,
      totalPhotoCount: albumTotalPhotos + albumTotalVideos,
      subAlbumsCount: directChildren.length,
    },
    ogImageUrl,
    subAlbums,
    photos,
    videos,
    media,
    pagination: {
      page,
      limit,
      totalPhotos: totalMedia,
      totalPages: Math.ceil(totalMedia / limit),
      hasMore: offset + photos.length + videos.length < totalMedia,
    },
    breadcrumbs,
  };
}
