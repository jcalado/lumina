'use client';

import { useTranslations } from 'next-intl';
import type { AlbumPageData } from '@/lib/types/album';

interface AlbumHeaderProps {
  album: AlbumPageData['album'];
}

// The download action lives in AlbumToolbar, alongside the other album actions.
export function AlbumHeader({ album }: AlbumHeaderProps) {
  const t = useTranslations('albums');

  return (
    <div>
      <h1 className="text-3xl font-bold text-balance">{album.name}</h1>
      {album.description && (
        <p className="text-muted-foreground mt-1 max-w-[70ch] text-pretty">{album.description}</p>
      )}
      {album.totalPhotoCount > 0 && album.totalPhotoCount !== album.photoCount && (
        <p className="text-sm text-muted-foreground mt-1">
          {album.totalPhotoCount} {t('photos')}
        </p>
      )}
    </div>
  );
}
