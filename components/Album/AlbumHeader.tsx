'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AlbumPageData } from '@/lib/types/album';

interface AlbumHeaderProps {
  album: AlbumPageData['album'];
  onDownload: () => void;
  isDownloading: boolean;
  hasPhotos: boolean;
}

export function AlbumHeader({ album, onDownload, isDownloading, hasPhotos }: AlbumHeaderProps) {
  const t = useTranslations('albums');

  return (
    <div className="flex sm:items-center justify-between flex-col sm:flex-row">
      <div>
        <h1 className="text-3xl font-bold">{album.name}</h1>
        {album.description && (
          <p className="text-muted-foreground mt-1">{album.description}</p>
        )}
        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
          {album.totalPhotoCount > 0 && album.totalPhotoCount !== album.photoCount && (
            <span>{album.totalPhotoCount} {t('photos')}</span>
          )}
        </div>
      </div>

      {hasPhotos && (
        <div className="flex gap-2">
          <button
            className="border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4 py-2 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
            onClick={onDownload}
            disabled={isDownloading}
          >
            <Download className="h-4 w-4" />
            {isDownloading ? 'Downloading...' : t('download_album')}
          </button>
        </div>
      )}
    </div>
  );
}
