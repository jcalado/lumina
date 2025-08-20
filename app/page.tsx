'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Folder, Image } from 'lucide-react';
import { useTranslations } from 'next-intl';



interface Album {
  id: string;
  path: string;
  name: string;
  description?: string;
  photoCount: number;
  totalPhotoCount?: number;
  subAlbumsCount?: number;
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {albums.map((album) => (
            <Link key={album.id} href={`/albums/${album.path}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Folder className="h-5 w-5" />
                    {album.name}
                  </CardTitle>
                  {album.description && (
                    <CardDescription className="line-clamp-2">
                      {album.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Image className="h-4 w-4" />
                      {album.photoCount} direct photos
                    </div>
                    <div className="flex gap-1">
                      {album.totalPhotoCount && album.totalPhotoCount > album.photoCount && (
                        <Badge variant="secondary" className="text-xs">
                          <Image className="h-3 w-3 mr-1" />
                          {album.totalPhotoCount} total
                        </Badge>
                      )}
                      {album.subAlbumsCount && album.subAlbumsCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <Folder className="h-3 w-3 mr-1" />
                          {album.subAlbumsCount} sub-albums
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Updated {new Date(album.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
