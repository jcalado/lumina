'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Folder, Image, Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScrubThumbnail } from '@/components/Gallery/ScrubThumbnail';



interface Album {
  id: string;
  path: string;
  name: string;
  description?: string;
  photoCount: number;
  totalPhotoCount?: number;
  subAlbumsCount?: number;
  thumbnails?: { photoId: string; filename: string }[];
  createdAt: string;
  updatedAt: string;
}

export default function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading albums...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('photo_albums')}</h1>
          <p className="text-muted-foreground">
            {t('description')}
          </p>
        </div>
      </div>

      {albums.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Folder className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Albums Found</CardTitle>
            <CardDescription className="mb-4">
              No photo albums have been found. Make sure your photos are properly organized in folders
              and click "Sync Photos" to scan for new content.
            </CardDescription>
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Photos'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {albums.map((album) => (
            <Link key={album.id} href={`/albums/${album.path}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                {/* Thumbnail Image */}
                <div className="aspect-[4/3] bg-muted relative overflow-hidden rounded-t-lg">
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

                  {/* Overlay with folder icon and badges - pointer-events-none to allow scrubbing */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
                    <div className="absolute top-2 left-2 pointer-events-auto">
                      <div className="bg-black/60 rounded-full p-1.5">
                        <Images className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 pointer-events-auto">
                      {album.totalPhotoCount && album.totalPhotoCount > 0 && (
                        <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                          <Image className="w-3 h-3 mr-1" />
                          {album.totalPhotoCount}
                        </Badge>
                      )}
                      {album.subAlbumsCount && album.subAlbumsCount > 0 && (
                        <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                          <Folder className="w-3 h-3 mr-1" />
                          {album.subAlbumsCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Album Details */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-sm line-clamp-2 flex-1">
                      {album.name}
                    </h3>
                  </div>
                  {album.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {album.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Image className="h-3 w-3" />
                      {album.photoCount} direct photos
                    </div>
                    <span>
                      Updated {new Date(album.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
