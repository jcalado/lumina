# Album Page Refactor Design

**Date:** 2026-02-16
**Status:** Approved

## Problem

The album page (`app/albums/[...path]/page.tsx`) is an 828-line client component that:

1. Creates a client-side waterfall: render shell -> resolve params -> fetch API -> render content
2. Triggers ~11 database queries per sub-album (N+1 problem)
3. Proxies every image through Next.js -> S3 instead of direct S3 access
4. Fires a separate API call for breadcrumbs on every page load
5. Appends all photos to the DOM without virtualization
6. Has no error boundaries or Suspense fallbacks
7. Contains extensive console.log statements

## Design

### 1. Server/Client Split

**Files:**

```
app/albums/[...path]/
  page.tsx          - Server Component: resolves params, fetches data, renders shell
  album-client.tsx  - Client Component: interactivity (sort, filter, lightbox, infinite scroll)
  loading.tsx       - Suspense fallback (skeleton)
  error.tsx         - Error boundary
```

**page.tsx (Server Component):**
- Awaits params to get path segments
- Calls `getAlbumPageData(slugPath)` — direct Prisma, no fetch
- Returns album, subAlbums (with batched metadata), photos (page 1), videos, media, pagination, breadcrumbs
- Passes everything as `initialData` to `<AlbumClient>`
- Generates metadata (title, description) for SEO

**album-client.tsx (Client Component):**
- Receives `initialData` prop — renders instantly, no waterfall
- Manages client-only state: sort order, favorites filter, lightbox, infinite scroll
- For subsequent pages (infinite scroll), calls the API route (page 2+ only)

### 2. Direct S3 URLs

- Build S3 URLs at data-fetch time: `${S3_ENDPOINT}/${S3_BUCKET}/${thumbnail.s3Key}`
- Include full URL in photo/thumbnail data returned to client
- PhotoImage and MediaImage receive direct URLs
- Still use Next.js `<Image>` for WebP/AVIF optimization
- next.config.js already allows all HTTPS domains via `remotePatterns`

### 3. Batched Sub-Album Queries

Two-pass approach — from ~11N queries to ~5-6 total:

**Pass 1:** Get all potential sub-albums with basic counts (1 query). Filter to direct children in JS.

**Pass 2:** Batch all metadata in parallel via Promise.all:
- Count children per sub-album (groupBy)
- Date ranges per sub-album (groupBy with _min/_max)
- Sample thumbnails across sub-albums (findMany with albumId IN)
- Recursive totals for descendant albums

### 4. Breadcrumbs in Album Response

- Compute breadcrumbs in `getAlbumPageData()` server function
- Slug-to-path resolution already walks segments — capture names along the way
- Return as part of initial data
- Remove separate `/api/albums/breadcrumbs` call from client

### 5. Virtualized Media Grid

- Library: `@tanstack/react-virtual`
- Row-based virtualization on the existing CSS grid
- Columns per row determined by breakpoint (2/3/4/6)
- useResizeObserver to recalculate on resize
- Keep square aspect ratio cells
- Infinite scroll via sentinel row near bottom
- Blurhash still works on mount/unmount

### 6. Extracted Components

```
components/Album/
  SubAlbumGrid.tsx       - Sub-album cards with ScrubThumbnail
  MediaGrid.tsx          - Virtualized photo/video grid
  SortFilterControls.tsx - Sort + favorites filter bar
  AlbumHeader.tsx        - Title, description, download button
```

### 7. Cleanup

- Remove all console.log statements
- error.tsx: Next.js App Router error boundary
- loading.tsx: Next.js Suspense boundary with skeleton
- Remove duplicate download function (keep job-based `startAlbumDownload` only)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Grid layout | Keep square grid | Simpler virtualization, consistent look |
| Virtualization lib | @tanstack/react-virtual | Headless, works with existing CSS grid |
| Query batching | Two-pass Prisma | Type-safe, no raw SQL, ~5-6 queries total |
| Client split | Single client island | Sort/filter/lightbox share state, simpler |
