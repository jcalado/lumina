'use client';

import { useRef, useState, useEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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

function getColumns(width: number): number {
  if (width >= 1024) return 6;  // lg
  if (width >= 768) return 4;   // md
  if (width >= 640) return 3;   // sm
  return 2;
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
  const listRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(6);

  // Track container width for responsive columns
  useEffect(() => {
    const updateColumns = () => {
      setColumns(getColumns(window.innerWidth));
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  const rowCount = Math.ceil(media.length / columns);
  const totalRows = rowCount + (hasMore ? 1 : 0);

  // Gap between items in pixels (gap-4 = 16px)
  const GAP = 16;

  const virtualizer = useWindowVirtualizer({
    count: totalRows,
    estimateSize: () => 200,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // Trigger load more when we reach the sentinel row
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= rowCount && hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [virtualizer.getVirtualItems(), rowCount, hasMore, loadingMore, onLoadMore]);

  if (media.length === 0) return null;

  return (
    <div ref={listRef}>
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
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
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
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${GAP}px`,
                  paddingBottom: `${GAP}px`,
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
                                orientation: mediaItem.type === 'photo' ? mediaItem.orientation : undefined,
                                blurhash: mediaItem.type === 'photo' ? mediaItem.blurhash : undefined,
                                thumbnailUrl: mediaItem.thumbnails?.find(t => t.size === 'SMALL')?.url || mediaItem.thumbnails?.[0]?.url,
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
