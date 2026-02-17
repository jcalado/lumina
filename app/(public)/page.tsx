'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefreshCw, Folder, Image } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScrubThumbnail } from '@/components/Gallery/ScrubThumbnail';

interface Album {
  id: string;
  path: string;
  slug: string;
  slugPath: string; // Hierarchical slug path for URLs
  name: string;
  description?: string;
  photoCount: number;
  totalPhotoCount?: number;
  subAlbumsCount?: number;
  thumbnails?: { photoId: string; filename: string }[];
  createdAt: string;
  updatedAt: string;
}

interface FeaturedAlbum {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  slugPath: string;
  coverThumbnailUrl: string | null;
}

export default function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [featuredAlbum, setFeaturedAlbum] = useState<FeaturedAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const t = useTranslations('home');

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    try {
      const response = await fetch('/api/albums');
      if (response.ok) {
        const data = await response.json();
        setAlbums(data.albums);
        setFeaturedAlbum(data.featuredAlbum ?? null);
      }
    } catch (error) {
      console.error('Error fetching albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      if (response.ok) {
        // Wait a moment then refresh albums
        setTimeout(() => {
          fetchAlbums();
          setSyncing(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Error syncing:', error);
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-10">
        <div className="text-center">
          <div className="h-10 w-48 bg-muted animate-pulse rounded mx-auto" />
          <div className="h-5 w-72 bg-muted animate-pulse rounded mx-auto mt-3" />
          <div className="h-4 w-20 bg-muted animate-pulse rounded mx-auto mt-2" />
        </div>
        <div className="rounded-2xl aspect-[21/9] bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-card ring-1 ring-border/50">
              <div className="aspect-[4/3] bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('photo_albums')}</h1>
        <p className="text-lg text-muted-foreground mt-2">
          {t('description')}
        </p>
        {albums.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'}
          </p>
        )}
      </div>

      {/* Featured Album Banner */}
      {featuredAlbum && (
        <Link
          href={`/albums/${featuredAlbum.slugPath || featuredAlbum.slug}`}
          className="block group animate-fade-in-up opacity-0 mb-2"
        >
          <div className="relative rounded-2xl overflow-hidden hover:shadow-2xl transition-shadow duration-300">
            <div className="aspect-[21/9] bg-muted relative overflow-hidden">
              {featuredAlbum.coverThumbnailUrl ? (
                <img
                  src={featuredAlbum.coverThumbnailUrl}
                  alt={featuredAlbum.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                  <Folder className="w-16 h-16 text-muted-foreground/50" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6 sm:p-8">
                <span className="text-xs uppercase tracking-widest text-white/80">
                  {t('featured')}
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  {featuredAlbum.name}
                </h2>
                {featuredAlbum.description && (
                  <p className="text-sm sm:text-base text-white/80 line-clamp-2 max-w-2xl mt-1">
                    {featuredAlbum.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Link>
      )}

      {albums.length === 0 ? (
        <div className="text-center py-16">
          <Folder className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Albums Found</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-4">
            No photo albums have been found. Make sure your photos are properly organized in folders
            and click &ldquo;Sync Photos&rdquo; to scan for new content.
          </p>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Photos'}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {albums.map((album, index) => (
            <Link key={album.id} href={`/albums/${album.slugPath || album.slug}`}>
              <div
                className="h-full rounded-xl overflow-hidden bg-card ring-1 ring-border/50 hover:-translate-y-1 hover:shadow-xl hover:ring-border transition-all duration-300 ease-out cursor-pointer group animate-fade-in-up opacity-0"
                style={{ animationDelay: `${Math.min(index * 75, 600)}ms` }}
              >
                {/* Thumbnail Image */}
                <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                  {album.thumbnails && album.thumbnails.length > 0 ? (
                    <ScrubThumbnail
                      thumbnails={album.thumbnails}
                      albumName={album.name}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <Folder className="w-12 h-12 text-muted-foreground/50" />
                    </div>
                  )}

                  {/* Badges - bottom-left with frosted glass */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
                    <div className="absolute bottom-2 left-2 flex gap-1 pointer-events-auto">
                      {album.totalPhotoCount && album.totalPhotoCount > 0 && (
                        <span className="inline-flex items-center backdrop-blur-sm bg-black/40 text-white text-[11px] rounded-full px-2 py-0.5">
                          <Image className="w-3 h-3 mr-1" />
                          {album.totalPhotoCount}
                        </span>
                      )}
                      {album.subAlbumsCount && album.subAlbumsCount > 0 && (
                        <span className="inline-flex items-center backdrop-blur-sm bg-black/40 text-white text-[11px] rounded-full px-2 py-0.5">
                          <Folder className="w-3 h-3 mr-1" />
                          {album.subAlbumsCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Album Details */}
                <div className="p-4">
                  <h3 className="font-semibold text-base line-clamp-2 mb-1">
                    {album.name}
                  </h3>
                  {album.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {album.description}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    <span>
                      {new Date(album.updatedAt).toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
