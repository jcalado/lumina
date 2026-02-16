'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Folder, Heart, Home } from 'lucide-react';
import { AlbumHeader } from '@/components/Album/AlbumHeader';
import { SortFilterControls } from '@/components/Album/SortFilterControls';
import { SubAlbumGrid } from '@/components/Album/SubAlbumGrid';
import { MediaGrid } from '@/components/Album/MediaGrid';
import { MediaLightbox } from '@/components/Gallery/MediaLightbox';
import { SelectedPhotosDownload } from '@/components/Download/SelectedPhotosDownload';
import { ResponsiveBreadcrumb } from '@/components/ui/responsive-breadcrumb';
import { useFavorites } from '@/contexts/FavoritesContext';

import type { AlbumPageData, MediaItem } from '@/lib/types/album';

interface AlbumClientProps {
  initialData: AlbumPageData;
  slugPath: string;
}

function toLightboxMedia(items: MediaItem[]) {
  return items.map(item => ({
    ...item,
    takenAt: item.takenAt,
    createdAt: item.createdAt,
    duration: item.type === 'video' ? (item.duration ?? undefined) : undefined,
    width: item.type === 'video' ? (item.width ?? undefined) : undefined,
    height: item.type === 'video' ? (item.height ?? undefined) : undefined,
    originalUrl: item.thumbnails?.find(t => t.size === 'LARGE')?.url,
  }));
}

export function AlbumClient({ initialData, slugPath }: AlbumClientProps) {
  const { isFavorite } = useFavorites();

  // --------------- State ---------------
  const [allMedia, setAllMedia] = useState<MediaItem[]>(initialData.media);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.pagination.hasMore);
  const [currentPage, setCurrentPage] = useState(initialData.pagination.page);

  // --------------- Derived ---------------
  const filteredMedia = showFavoritesOnly
    ? allMedia.filter(m => isFavorite(m.id))
    : allMedia;

  // --------------- Breadcrumbs ---------------
  const breadcrumbItems = [
    { name: 'Home', path: '', href: '/', icon: Home },
    ...initialData.breadcrumbs.map(b => ({
      name: b.name,
      path: b.href,
      href: b.href,
      icon: Folder,
    })),
  ];

  // --------------- Data fetching ---------------
  const fetchPage = useCallback(async (page: number, sort: 'asc' | 'desc', isReset: boolean) => {
    const encodedPath = slugPath.split('/').map(s => encodeURIComponent(s)).join('/');
    const params = new URLSearchParams({ sortBy: sort, page: String(page) });
    const res = await fetch(`/api/albums/${encodedPath}?${params}`);
    if (!res.ok) return;
    const data = await res.json();

    if (isReset) {
      setAllMedia(data.media || []);
    } else {
      setAllMedia(prev => [...prev, ...(data.media || [])]);
    }

    if (data.pagination) {
      setHasMore(data.pagination.hasMore);
      setCurrentPage(data.pagination.page);
    } else {
      setHasMore(false);
    }
  }, [slugPath]);

  // --------------- Sort change ---------------
  const handleSortChange = useCallback(async (newSort: 'asc' | 'desc') => {
    if (newSort === sortOrder) return;
    setSortOrder(newSort);
    setCurrentPage(1);
    setHasMore(true);
    await fetchPage(1, newSort, true);
  }, [sortOrder, fetchPage]);

  // --------------- Infinite scroll ---------------
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(currentPage + 1, sortOrder, false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, currentPage, sortOrder, fetchPage]);

  // --------------- Lightbox ---------------
  const openLightbox = useCallback((filteredIndex: number) => {
    const filteredItem = filteredMedia[filteredIndex];
    const originalIndex = allMedia.findIndex(m => m.id === filteredItem.id);
    setCurrentMediaIndex(originalIndex >= 0 ? originalIndex : filteredIndex);
    setLightboxOpen(true);
  }, [filteredMedia, allMedia]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const navigateToMedia = useCallback((index: number) => {
    setCurrentMediaIndex(index);
  }, []);

  // --------------- Download ---------------
  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      const res = await fetch('/api/download/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'album', albumPath: slugPath }),
      });
      if (!res.ok) throw new Error('Download failed');
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } catch {
      alert('Failed to start download. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading, slugPath]);

  // --------------- Render ---------------
  const hasPhotos = allMedia.length > 0;
  const isEmpty = filteredMedia.length === 0 && initialData.subAlbums.length === 0;
  const noFavorites = showFavoritesOnly && filteredMedia.length === 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <ResponsiveBreadcrumb items={breadcrumbItems} />

      {/* Header */}
      <AlbumHeader
        album={initialData.album}
        onDownload={handleDownload}
        isDownloading={isDownloading}
        hasPhotos={hasPhotos}
      />

      {/* Sort & Filter Controls */}
      {hasPhotos && (
        <SortFilterControls
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          showFavoritesOnly={showFavoritesOnly}
          onFavoritesToggle={setShowFavoritesOnly}
        />
      )}

      {/* Sub-albums */}
      <SubAlbumGrid subAlbums={initialData.subAlbums} />

      {/* Empty states */}
      {isEmpty && !noFavorites && (
        <Card className="text-center py-16">
          <CardContent>
            <Folder className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">Empty Album</CardTitle>
            <CardDescription>
              This album doesn't contain any photos, videos or sub-albums yet.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {noFavorites && (
        <Card className="text-center py-16">
          <CardContent>
            <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Favorites</CardTitle>
            <CardDescription>
              You haven't marked any photos or videos as favorites in this album yet.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {/* Media section */}
      {filteredMedia.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Media {showFavoritesOnly && <span className="text-muted-foreground">({filteredMedia.length} favorites)</span>}
            {initialData.pagination && !showFavoritesOnly && (
              <span className="text-muted-foreground text-base font-normal ml-2">
                ({filteredMedia.length} of {initialData.pagination.totalPhotos})
              </span>
            )}
          </h2>
          <MediaGrid
            media={filteredMedia}
            onMediaClick={openLightbox}
            hasMore={hasMore && !showFavoritesOnly}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            totalCount={initialData.pagination.totalPhotos}
            showFavoritesOnly={showFavoritesOnly}
          />
        </div>
      )}

      {/* Lightbox */}
      <MediaLightbox
        media={toLightboxMedia(allMedia)}
        currentIndex={currentMediaIndex}
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        onNavigate={navigateToMedia}
      />

      {/* Selected Photos Download Widget */}
      <SelectedPhotosDownload albumPath={slugPath} />
    </div>
  );
}
