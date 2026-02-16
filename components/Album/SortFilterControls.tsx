'use client';

import { ArrowUpDown, Filter, Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SortFilterControlsProps {
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  showFavoritesOnly: boolean;
  onFavoritesToggle: (show: boolean) => void;
}

export function SortFilterControls({ sortOrder, onSortChange, showFavoritesOnly, onFavoritesToggle }: SortFilterControlsProps) {
  const t = useTranslations('albums');

  return (
    <div className="flex gap-2 items-center p-4 bg-muted/50 rounded-lg flex-col sm:flex-row">
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('sort_by_date')}</span>
        <button
          className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
            sortOrder === 'asc'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => onSortChange('asc')}
        >
          {t('oldest_first')}
        </button>
        <button
          className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
            sortOrder === 'desc'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => onSortChange('desc')}
        >
          {t('newest_first')}
        </button>
      </div>

      <div className="h-4 w-px bg-border mx-2" />

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t('show')}</span>
        <button
          className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
            !showFavoritesOnly
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => onFavoritesToggle(false)}
        >
          {t('all_photos')}
        </button>
        <button
          className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium gap-1 ${
            showFavoritesOnly
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => onFavoritesToggle(true)}
        >
          <Heart className="h-3 w-3" />
          {t('favorites_only')}
        </button>
      </div>
    </div>
  );
}
