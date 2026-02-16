# Album Page Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the 828-line client-component album page into a Server Component + Client Component architecture with batched queries, direct S3 URLs, virtualization, and extracted components.

**Architecture:** Server Component (`page.tsx`) fetches data via direct Prisma calls and passes it to a single Client Component island (`album-client.tsx`). Images load directly from S3 URLs. Sub-album queries are batched into ~5-6 total queries. The media grid uses `@tanstack/react-virtual` for virtualization.

**Tech Stack:** Next.js 15.5 App Router, Prisma, `@tanstack/react-virtual`, TypeScript, Tailwind CSS

---

### Task 1: Install @tanstack/react-virtual

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install @tanstack/react-virtual`
Expected: Package added to package.json dependencies

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @tanstack/react-virtual for grid virtualization"
```

---

### Task 2: Create S3 URL helper

Add a utility function that builds a public S3 URL from an s3Key. This will be used by the server data-fetching layer to embed direct URLs in the response.

**Files:**
- Modify: `lib/s3.ts`

**Step 1: Add `getPublicUrl` to S3Service**

Add this method to the `S3Service` class in `lib/s3.ts` (after `getSignedUrl` around line 165):

```typescript
/**
 * Build a direct public URL for an S3 object.
 * Only works when the bucket / object is publicly readable.
 */
getPublicUrl(key: string): string {
  this.initializeBucket();
  return `${process.env.S3_ENDPOINT}/${this.bucket}/${key}`;
}
```

**Step 2: Commit**

```bash
git add lib/s3.ts
git commit -m "feat: add getPublicUrl helper to S3Service"
```

---

### Task 3: Create shared types for album page data

Define the TypeScript types used by both the server data function and the client component. Currently these are duplicated inline inside the page component.

**Files:**
- Create: `lib/types/album.ts`

**Step 1: Create the shared types file**

```typescript
export interface ThumbnailData {
  size: string;
  s3Key: string;
  url: string; // direct S3 URL
  width: number;
  height: number;
}

export interface PhotoData {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  blurhash?: string | null;
  orientation?: number;
  metadata?: string | null;
  thumbnails: ThumbnailData[];
}

export interface VideoData {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  metadata?: string | null;
  thumbnails: ThumbnailData[];
}

export type MediaItem = (PhotoData & { type: 'photo' }) | (VideoData & { type: 'video' });

export interface SubAlbumData {
  id: string;
  path: string;
  slugPath: string;
  name: string;
  description: string | null;
  photoCount: number;
  totalPhotoCount: number;
  subAlbumsCount: number;
  thumbnails: {
    mediaId: string;
    filename: string;
    mediaType: 'photo' | 'video';
  }[];
  dateRange?: {
    earliest: string | null;
    latest: string | null;
  } | null;
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export interface PaginationData {
  page: number;
  limit: number;
  totalPhotos: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AlbumPageData {
  album: {
    id: string;
    path: string;
    slugPath: string;
    name: string;
    description: string | null;
    photoCount: number;
    totalPhotoCount: number;
    subAlbumsCount: number;
  };
  subAlbums: SubAlbumData[];
  photos: PhotoData[];
  videos: VideoData[];
  media: MediaItem[];
  pagination: PaginationData;
  breadcrumbs: BreadcrumbItem[];
}
```

**Step 2: Commit**

```bash
git add lib/types/album.ts
git commit -m "feat: add shared types for album page data"
```

---

### Task 4: Create server data-fetching function with batched queries

This is the core data layer. It replaces the API route logic with a direct Prisma function, batches sub-album queries, computes breadcrumbs inline, and embeds S3 URLs.

**Files:**
- Create: `lib/data/album.ts`

**Step 1: Create `getAlbumPageData` function**

This function should:

1. **Resolve the slug path** to a filesystem path using `slugPathToPath()`. While walking segments, capture the album name at each level for breadcrumbs (avoids a separate breadcrumb API call).

2. **Fetch settings** (photosPerPage) once.

3. **Fetch the main album** with paginated photos and videos, including thumbnails. Apply sort order.

4. **Transform thumbnails** to include direct S3 URLs using `s3.getPublicUrl(thumbnail.s3Key)`.

5. **Fetch sub-albums with batched queries** (the key performance improvement):

   **Pass 1** — Single query to get all descendant albums:
   ```typescript
   const allDescendants = await prisma.album.findMany({
     where: {
       status: 'PUBLIC',
       enabled: true,
       path: { startsWith: albumPath + '/' },
     },
     select: { id: true, path: true, name: true, slug: true, description: true, displayOrder: true,
       _count: { select: { photos: true } }
     },
     orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
   });
   ```
   Then filter to direct children in JS (path segments = parent segments + 1).

   **Pass 2** — Batch all metadata with `Promise.all`:
   ```typescript
   const directChildIds = directChildren.map(a => a.id);
   const allDescendantIds = allDescendants.map(a => a.id);

   const [
     childAlbumCounts,    // how many sub-albums each child has
     photoCounts,         // total photo count per child (including nested)
     videoCounts,         // total video count per child (including nested)
     photoDateRanges,     // min/max takenAt per child
     videoDateRanges,     // min/max takenAt per child
     samplePhotos,        // thumbnail samples per child
   ] = await Promise.all([
     // Count sub-albums per direct child
     prisma.album.groupBy({
       by: ['path'],
       where: { status: 'PUBLIC', enabled: true, path: { in: /* descendant paths grouped by child prefix */ } },
       // (handled in JS by grouping descendants under each child)
     }),
     // ... similar batched queries for counts and aggregates
   ]);
   ```

   For **sub-album counts**: iterate `allDescendants` and count how many have paths starting with each direct child's path + '/'.

   For **total photo/video counts**: use `prisma.photo.groupBy({ by: ['albumId'], _count: true, where: { albumId: { in: allDescendantIds } } })` then sum counts per child tree.

   For **date ranges**: use `prisma.photo.aggregate` with OR conditions grouping by child tree, or do per-child aggregates in parallel (still better than sequential).

   For **sample thumbnails**: fetch a limited set of photos per child album (use a single query with `albumId IN directChildIds` and then distribute in JS).

6. **Build breadcrumbs** from the slug path resolution walk (each segment yields a name + href).

7. **Add orientation** from metadata for each photo using `getPhotoOrientation()`.

8. **Return** typed `AlbumPageData`.

The function signature:
```typescript
export async function getAlbumPageData(
  slugPath: string,
  options?: { sortBy?: 'asc' | 'desc'; page?: number; limit?: number }
): Promise<AlbumPageData | null>
```

Returns `null` if album not found or not accessible.

**Key implementation detail for S3 URLs**: When transforming photos and thumbnails, map each thumbnail to include a `url` field:
```typescript
thumbnails: photo.thumbnails.map(t => ({
  size: t.size,
  s3Key: t.s3Key,
  url: s3.getPublicUrl(t.s3Key),
  width: t.width,
  height: t.height,
}))
```

**Step 2: Commit**

```bash
git add lib/data/album.ts
git commit -m "feat: add getAlbumPageData with batched queries and S3 URLs"
```

---

### Task 5: Update PhotoImage to accept direct URL

Currently `PhotoImage` builds `/api/photos/{id}/serve?size=...` internally. Change it to accept an optional `src` prop — when provided, use it directly instead of constructing the API URL.

**Files:**
- Modify: `components/PhotoImage.tsx`

**Step 1: Add `src` prop and use it when available**

Update the interface:
```typescript
interface PhotoImageProps {
  photoId?: string;     // now optional
  filename: string;
  className?: string;
  alt?: string;
  size?: 'small' | 'medium' | 'large';
  lazy?: boolean;
  blurhash?: string | null;
  orientation?: number;
  src?: string;         // direct URL — skips API proxy
}
```

Update the `loadImage` function inside the `useEffect` (line 63-67):
```typescript
const loadImage = () => {
  setLoading(true);
  setError(false);
  if (src) {
    setImageUrl(src);
  } else if (photoId) {
    setImageUrl(`/api/photos/${photoId}/serve?size=${size}`);
  }
};
```

Add `src` to the useEffect dependency array: `[photoId, size, inView, src]`.

**Step 2: Commit**

```bash
git add components/PhotoImage.tsx
git commit -m "feat: PhotoImage accepts direct src URL, falls back to API proxy"
```

---

### Task 6: Update VideoImage to accept direct URL

Same pattern as PhotoImage.

**Files:**
- Modify: `components/VideoImage.tsx`

**Step 1: Add `src` prop**

Update the interface to add `src?: string` (optional). When `src` is provided, use it instead of `/api/videos/${videoId}/serve?size=${size}`.

Update the `loadThumbnail` function:
```typescript
const loadThumbnail = () => {
  setLoading(true);
  setError(false);
  if (src) {
    setThumbnailUrl(src);
  } else if (videoId) {
    setThumbnailUrl(`/api/videos/${videoId}/serve?size=${size}`);
  }
};
```

Make `videoId` optional in the interface. Add `src` to the useEffect deps.

**Step 2: Commit**

```bash
git add components/VideoImage.tsx
git commit -m "feat: VideoImage accepts direct src URL"
```

---

### Task 7: Update MediaImage to pass through `src`

**Files:**
- Modify: `components/MediaImage.tsx`

**Step 1: Add thumbnailUrl to MediaItem and pass to children**

Update `MediaItem` interface:
```typescript
export interface MediaItem {
  id: string;
  type: MediaType;
  filename: string;
  orientation?: number;
  blurhash?: string | null;
  thumbnailUrl?: string;  // direct S3 URL for thumbnail
}
```

Update `MediaImageProps` to include optional `src`:
```typescript
interface MediaImageProps {
  media: MediaItem;
  className?: string;
  alt?: string;
  size?: 'small' | 'medium' | 'large';
  lazy?: boolean;
  src?: string;  // override URL
}
```

Pass `src={src || media.thumbnailUrl}` to both `PhotoImage` and `VideoImage`.

**Step 2: Commit**

```bash
git add components/MediaImage.tsx
git commit -m "feat: MediaImage passes through direct S3 URLs"
```

---

### Task 8: Update ScrubThumbnail to use direct URLs

**Files:**
- Modify: `components/Gallery/ScrubThumbnail.tsx`

**Step 1: Add optional `thumbnailUrl` to thumbnail interfaces**

Add `thumbnailUrl?: string` to both `MediaThumbnail` and `PhotoThumbnail` interfaces.

Pass `src={thumbnailUrl}` to `MediaImage` and `PhotoImage` when available.

**Step 2: Commit**

```bash
git add components/Gallery/ScrubThumbnail.tsx
git commit -m "feat: ScrubThumbnail supports direct S3 URLs"
```

---

### Task 9: Update MediaLightbox to use direct S3 URLs

**Files:**
- Modify: `components/Gallery/MediaLightbox.tsx`

**Step 1: Add optional `thumbnailUrl` and `originalUrl` to Media interface**

In the `Media` interface (line 24-38), add:
```typescript
thumbnailUrl?: string;  // direct URL for thumbnail
originalUrl?: string;   // direct URL for original/large
```

**Step 2: Use direct URLs when available**

For photos (line 345-351), change:
```typescript
src={currentMedia.originalUrl || `/api/photos/${currentMedia.id}/serve?size=large`}
```

For videos (line 297):
```typescript
src={currentMedia.originalUrl || `/api/videos/${currentMedia.id}/serve?size=original`}
```

**Step 3: Commit**

```bash
git add components/Gallery/MediaLightbox.tsx
git commit -m "feat: MediaLightbox uses direct S3 URLs with API fallback"
```

---

### Task 10: Create extracted components (AlbumHeader, SortFilterControls, SubAlbumGrid)

Extract sections of the monolith page into focused components.

**Files:**
- Create: `components/Album/AlbumHeader.tsx`
- Create: `components/Album/SortFilterControls.tsx`
- Create: `components/Album/SubAlbumGrid.tsx`

**Step 1: Create AlbumHeader**

Extract lines 572-601 from current page.tsx. Props:
```typescript
interface AlbumHeaderProps {
  album: AlbumPageData['album'];
  onDownload: () => void;
  isDownloading: boolean;
  hasPhotos: boolean;
}
```

Contains: album name, description, photo count, download button.

**Step 2: Create SortFilterControls**

Extract lines 603-659 from current page.tsx. Props:
```typescript
interface SortFilterControlsProps {
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  showFavoritesOnly: boolean;
  onFavoritesToggle: (show: boolean) => void;
}
```

**Step 3: Create SubAlbumGrid**

Extract lines 661-727 from current page.tsx. Props:
```typescript
interface SubAlbumGridProps {
  subAlbums: SubAlbumData[];
}
```

Contains: the sub-album card grid with `ScrubThumbnail`, badges, date ranges, and links.

**Step 4: Commit**

```bash
git add components/Album/
git commit -m "feat: extract AlbumHeader, SortFilterControls, SubAlbumGrid components"
```

---

### Task 11: Create VirtualizedMediaGrid component

The core virtualization component that replaces the flat grid.

**Files:**
- Create: `components/Album/MediaGrid.tsx`

**Step 1: Implement the virtualized grid**

```typescript
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { MediaImage } from '@/components/MediaImage';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';
import { DownloadSelectionButton } from '@/components/Download/DownloadSelectionButton';
import type { MediaItem } from '@/lib/types/album';

interface MediaGridProps {
  media: MediaItem[];
  onMediaClick: (index: number) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  totalCount?: number;
  showFavoritesOnly?: boolean;
}

// Breakpoint -> columns mapping (matches current CSS grid)
function getColumns(width: number): number {
  if (width >= 1280) return 6;  // xl
  if (width >= 1024) return 6;  // lg
  if (width >= 768) return 4;   // md
  if (width >= 640) return 3;   // sm
  return 2;                     // default
}

export function MediaGrid({
  media,
  onMediaClick,
  hasMore,
  loadingMore,
  onLoadMore,
  totalCount,
  showFavoritesOnly,
}: MediaGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(6);

  // Track container width for responsive columns
  useEffect(() => {
    if (!parentRef.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      setColumns(getColumns(width));
    });
    observer.observe(parentRef.current);
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(media.length / columns);
  // Add an extra row for the "load more" sentinel
  const totalRows = rowCount + (hasMore ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // estimated row height (will be measured)
    overscan: 3,
  });

  // Trigger load more when virtualizer reaches the sentinel row
  useEffect(() => {
    const lastItem = virtualizer.getVirtualItems().at(-1);
    if (!lastItem) return;
    if (lastItem.index >= rowCount && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), rowCount, hasMore, loadingMore, onLoadMore]);

  const gap = 16; // gap-4 = 1rem = 16px

  return (
    <div
      ref={parentRef}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const rowIndex = virtualRow.index;

          // Sentinel row for infinite scroll
          if (rowIndex >= rowCount) {
            return (
              <div
                key="sentinel"
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    <span>Loading more photos...</span>
                  </div>
                )}
              </div>
            );
          }

          const startIdx = rowIndex * columns;
          const rowItems = media.slice(startIdx, startIdx + columns);

          return (
            <div
              key={virtualRow.index}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${gap}px`,
                paddingBottom: `${gap}px`,
              }}
            >
              {rowItems.map((mediaItem, colIdx) => {
                const globalIdx = startIdx + colIdx;
                return (
                  <div
                    key={mediaItem.id}
                    className="cursor-pointer"
                    onClick={() => onMediaClick(globalIdx)}
                  >
                    <Card className="group hover:shadow-lg transition-shadow">
                      <CardContent className="p-0">
                        <div className="aspect-square bg-muted rounded-md relative overflow-hidden">
                          <MediaImage
                            media={{
                              id: mediaItem.id,
                              type: mediaItem.type,
                              filename: mediaItem.filename,
                              orientation: mediaItem.type === 'photo' ? (mediaItem as any).orientation : undefined,
                              blurhash: mediaItem.type === 'photo' ? (mediaItem as any).blurhash : undefined,
                            }}
                            className="aspect-square rounded-md"
                            alt={`${mediaItem.type === 'photo' ? 'Photo' : 'Video'} ${mediaItem.filename}`}
                          />
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DownloadSelectionButton photoId={mediaItem.id} />
                            <FavoriteButton photoId={mediaItem.id} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {!hasMore && media.length > 0 && !showFavoritesOnly && (
        <div className="text-center text-muted-foreground py-8">
          <p>You've seen all {totalCount || media.length} photos in this album</p>
        </div>
      )}
    </div>
  );
}
```

**Important:** The virtualizer uses `overflow: auto` on the parent ref. Since this is inside the page layout (not a fixed-height container), we need to use `useWindowVirtualizer` instead if the page itself scrolls. Check at implementation time whether the page has a scrollable container or uses window scroll. If window scroll, switch to `useWindowVirtualizer` from `@tanstack/react-virtual`.

**Step 2: Commit**

```bash
git add components/Album/MediaGrid.tsx
git commit -m "feat: add VirtualizedMediaGrid with @tanstack/react-virtual"
```

---

### Task 12: Create the Server Component page.tsx

Replace the current client-component page with a Server Component that fetches data and passes it down.

**Files:**
- Rewrite: `app/albums/[...path]/page.tsx`

**Step 1: Write the new Server Component**

```typescript
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getAlbumPageData } from '@/lib/data/album';
import { AlbumClient } from './album-client';

interface AlbumPageProps {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: AlbumPageProps): Promise<Metadata> {
  const { path } = await params;
  const slugPath = path.map(s => decodeURIComponent(s)).join('/');
  const data = await getAlbumPageData(slugPath);

  if (!data) {
    return { title: 'Album Not Found' };
  }

  return {
    title: data.album.name,
    description: data.album.description || `Photo album: ${data.album.name}`,
  };
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { path } = await params;
  const slugPath = path.map(s => decodeURIComponent(s)).join('/');
  const data = await getAlbumPageData(slugPath);

  if (!data) {
    notFound();
  }

  return <AlbumClient initialData={data} slugPath={slugPath} />;
}
```

**Step 2: Commit**

```bash
git add app/albums/[...path]/page.tsx
git commit -m "feat: rewrite album page as Server Component with SSR data fetching"
```

---

### Task 13: Create the Client Component album-client.tsx

This is the interactive shell. It receives server-fetched data and manages client-only state.

**Files:**
- Create: `app/albums/[...path]/album-client.tsx`

**Step 1: Write the client component**

The component should:

1. Accept `initialData: AlbumPageData` and `slugPath: string` as props.
2. Initialize state from `initialData` (no loading spinner on first render).
3. Manage client state: `sortOrder`, `showFavoritesOnly`, `lightboxOpen`, `currentMediaIndex`, `isDownloading`.
4. For **sort order changes**: re-fetch from the API with new sort, reset media list.
5. For **infinite scroll**: fetch page N+1 from API, append to media.
6. For **favorites filter**: filter client-side from `allMedia`.
7. Render: `<ResponsiveBreadcrumb>`, `<AlbumHeader>`, `<SortFilterControls>`, `<SubAlbumGrid>`, `<MediaGrid>`, `<MediaLightbox>`, `<SelectedPhotosDownload>`.
8. Pass breadcrumbs from `initialData.breadcrumbs` directly to `<ResponsiveBreadcrumb>` — no separate API call.
9. No `console.log` statements.
10. Remove the duplicate `downloadAlbum` function — keep only `startAlbumDownload` (the job-based one).

When fetching subsequent pages (sort change or page 2+), call the existing `/api/albums/[...path]` route — it still exists and works. The API route also needs the S3 URL transformation (Task 14).

**Step 2: Commit**

```bash
git add app/albums/[...path]/album-client.tsx
git commit -m "feat: add AlbumClient with sort, filter, lightbox, infinite scroll"
```

---

### Task 14: Update the API route to include S3 URLs

The API route at `/api/albums/[...path]/route.ts` is still used for infinite scroll (pages 2+) and sort changes. Update it to:

1. Include direct S3 URLs in thumbnail data.
2. Remove all `console.log` statements.
3. Batch sub-album queries using the same logic from `getAlbumPageData` (or extract a shared function).

**Files:**
- Modify: `app/api/albums/[...path]/route.ts`

**Step 1: Import s3 service and add URLs to thumbnail responses**

For each photo/video thumbnail in the response, add:
```typescript
url: s3.getPublicUrl(thumbnail.s3Key)
```

**Step 2: Remove all console.log and console.error statements**

Remove lines: 39, 57, 78-82, 127, 172, 195, 250, 262, 510, 607-611.

**Step 3: Share batched query logic**

Extract the sub-album batching from `lib/data/album.ts` into a shared function `getSubAlbumsWithMetadata(albumPath)` that both the server function and the API route can use. Place it in `lib/data/album.ts` and export it.

**Step 4: Commit**

```bash
git add app/api/albums/[...path]/route.ts lib/data/album.ts
git commit -m "feat: API route uses batched queries and direct S3 URLs, remove console.logs"
```

---

### Task 15: Create loading.tsx and error.tsx

**Files:**
- Create: `app/albums/[...path]/loading.tsx`
- Create: `app/albums/[...path]/error.tsx`

**Step 1: Create loading.tsx (Suspense fallback)**

```typescript
export default function AlbumLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb skeleton */}
      <div className="h-6 w-48 bg-muted rounded animate-pulse" />

      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-64 bg-muted rounded animate-pulse" />
        <div className="h-5 w-96 bg-muted rounded animate-pulse" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create error.tsx (Error Boundary)**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Image } from 'lucide-react';

export default function AlbumError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="text-center py-16">
      <Card className="max-w-md mx-auto">
        <CardContent className="py-16">
          <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <CardTitle className="mb-2">Something went wrong</CardTitle>
          <CardDescription className="mb-4">
            {error.message || 'Failed to load album'}
          </CardDescription>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add app/albums/[...path]/loading.tsx app/albums/[...path]/error.tsx
git commit -m "feat: add loading.tsx skeleton and error.tsx boundary for album page"
```

---

### Task 16: Clean up breadcrumbs API route

Since breadcrumbs are now computed server-side in `getAlbumPageData`, the dedicated breadcrumbs API is no longer called by the album page. Check if any other code uses it. If not, delete it. If yes, keep it but remove console.logs.

**Files:**
- Possibly delete: `app/api/albums/breadcrumbs/route.ts`

**Step 1: Search for usages of `/api/albums/breadcrumbs`**

Run: `grep -r "breadcrumbs" --include="*.ts" --include="*.tsx" app/ components/ lib/`

If the only consumer was the old album page `Breadcrumb` component (which is now removed), delete the route.

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove unused breadcrumbs API route"
```

---

### Task 17: Remove console.logs from other files

Clean up remaining console.log statements in files touched by this refactor.

**Files:**
- Modify: `lib/slug-paths.ts` (no console.logs — already clean)
- Modify: `lib/photo-orientation.ts` (line 28: `console.error` — keep this one, it's a real error)
- Modify: `app/api/albums/breadcrumbs/route.ts` (if kept — remove console.logs)

**Step 1: Search and remove**

Run: `grep -rn "console\." app/api/albums/ components/Gallery/ components/PhotoImage.tsx components/VideoImage.tsx`

Remove all `console.log` and `console.error` that are just debug logging. Keep `console.error` for genuine unexpected errors only.

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove debug console.log statements"
```

---

### Task 18: Integration testing and verification

**Step 1: Run the dev server**

Run: `npm run dev`

**Step 2: Test the album page**

Navigate to an album page (e.g., `/albums/acnac`). Verify:
- [ ] Page loads without a client-side loading spinner (SSR data)
- [ ] Breadcrumbs render immediately (no flash)
- [ ] Sub-album cards show thumbnails
- [ ] Photo grid renders with correct layout
- [ ] Sort controls work (oldest/newest)
- [ ] Favorites filter works
- [ ] Lightbox opens and navigates
- [ ] Infinite scroll loads more photos
- [ ] Images load from S3 directly (check Network tab — no `/api/photos/.../serve` requests for thumbnails)
- [ ] Download album button works
- [ ] Download selection works

**Step 3: Test error states**

Navigate to a non-existent album path. Verify error.tsx renders.

**Step 4: Check TypeScript**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Check build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Final commit**

Fix any issues found during testing, then:
```bash
git add -A
git commit -m "fix: address integration test findings"
```

---

## Task Dependency Order

```
Task 1 (install dep) ─────────────────────┐
Task 2 (S3 URL helper) ──────────────────┐│
Task 3 (shared types) ──────────────────┐││
                                         ├┤│
Task 4 (server data function) ──────────┘││
                                         ││
Task 5 (PhotoImage src) ────────────────┐││
Task 6 (VideoImage src) ────────────────┤││
Task 7 (MediaImage src) ────────────────┤││
Task 8 (ScrubThumbnail src) ────────────┤││
Task 9 (MediaLightbox src) ─────────────┤││
                                         │││
Task 10 (extracted components) ─────────┐│││
Task 11 (VirtualizedMediaGrid) ─────────┤│││
                                         ├┤││
Task 12 (Server Component page) ────────┘│││
Task 13 (Client Component) ─────────────┘│││
                                          │││
Task 14 (API route update) ──────────────┘│├─ can happen in parallel
Task 15 (loading/error) ──────────────────┘│
Task 16 (breadcrumbs cleanup) ─────────────┘
Task 17 (console.log cleanup) ──────────────
Task 18 (integration testing) ──────────────
```

Tasks 1-3 can run in parallel. Tasks 5-9 can run in parallel. Tasks 10-11 can run in parallel. Task 12 depends on 4, 10, 11. Task 13 depends on 12. Tasks 14-16 can run in parallel after 13.
