'use client';

import { CalendarArrowDown, CalendarArrowUp, Download, Heart, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AlbumToolbarProps {
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  showFavoritesOnly: boolean;
  onFavoritesToggle: (show: boolean) => void;
  onDownload: () => void;
  isDownloading: boolean;
}

/**
 * This project's --accent is nearly the same blue as --primary, so the stock
 * hover on an outline button reads as "selected". In this bar the filled blue
 * means "this is the current state", so inactive controls hover to a neutral.
 */
const INACTIVE_HOVER = 'hover:bg-muted-foreground/15 hover:text-foreground';

/**
 * The album's action bar: the download action on the left, view controls on
 * the right. The sort pair and the favourites filter are icon-first — their
 * labels live in tooltips and accessible names so the bar stays compact.
 */
export function AlbumToolbar({
  sortOrder,
  onSortChange,
  showFavoritesOnly,
  onFavoritesToggle,
  onDownload,
  isDownloading,
}: AlbumToolbarProps) {
  const t = useTranslations('albums');

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className={INACTIVE_HOVER}
          onClick={onDownload}
          disabled={isDownloading}
        >
          {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
          {isDownloading ? t('downloading') : t('download_album')}
        </Button>

        {/* ml-auto keeps the view controls on the right, and lets them drop to
            their own row on narrow screens without losing that alignment. */}
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showFavoritesOnly ? 'default' : 'outline'}
                size="sm"
                className={showFavoritesOnly ? undefined : INACTIVE_HOVER}
                aria-pressed={showFavoritesOnly}
                onClick={() => onFavoritesToggle(!showFavoritesOnly)}
              >
                <Heart className={showFavoritesOnly ? 'fill-current' : undefined} />
                {t('favorites_only')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showFavoritesOnly ? t('show_all_photos') : t('show_favorites_only')}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-5" />

          <div className="flex items-center gap-1" role="group" aria-label={t('sort_by_date')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={sortOrder === 'asc' ? 'default' : 'outline'}
                  size="icon"
                  className={cn('h-8 w-8', sortOrder !== 'asc' && INACTIVE_HOVER)}
                  aria-label={t('oldest_first')}
                  aria-pressed={sortOrder === 'asc'}
                  onClick={() => onSortChange('asc')}
                >
                  <CalendarArrowUp />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('oldest_first')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={sortOrder === 'desc' ? 'default' : 'outline'}
                  size="icon"
                  className={cn('h-8 w-8', sortOrder !== 'desc' && INACTIVE_HOVER)}
                  aria-label={t('newest_first')}
                  aria-pressed={sortOrder === 'desc'}
                  onClick={() => onSortChange('desc')}
                >
                  <CalendarArrowDown />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('newest_first')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
