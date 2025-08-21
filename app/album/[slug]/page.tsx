'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Image, Download, Heart, Folder, Images, ChevronRight, Home, ArrowUpDown, Filter } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { Lightbox } from '@/components/Gallery/Lightbox';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';
import { useFavorites } from '@/contexts/FavoritesContext';
import { ScrubThumbnail } from '@/components/Gallery/ScrubThumbnail';
import { useTranslations } from 'next-intl';

interface Photo {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  blurhash?: string | null;
  thumbnails: {
    size: string;
    s3Key: string;
    width: number;
    height: number;
  }[];
}

interface Album {
  id: string;
  path: string;
  slug: string;
  name: string;
  description: string | null;
  photoCount: number;
  totalPhotoCount?: number;
  subAlbumsCount?: number;
  thumbnails: {
    photoId: string;
    filename: string;
  }[];
  dateRange?: {
    earliest: string | null;
    latest: string | null;
  } | null;
}

export default function AlbumSlugPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('albums');
  const slug = params.slug as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const { favorites } = useFavorites();

  useEffect(() => {
    if (slug) {
      fetchAlbumBySlug();
    }
  }, [slug]);

  useEffect(() => {
    if (album) {
      fetchPhotos();
    }
  }, [album, showFavoritesOnly, sortOrder]);

  const fetchAlbumBySlug = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/albums/by-slug/${slug}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Album not found');
        } else {
          throw new Error('Failed to fetch album');
        }
        return;
      }
      
      const data = await response.json();
      setAlbum(data.album);
    } catch (error) {
      console.error('Error fetching album:', error);
      setError('Failed to load album');
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    if (!album) return;

    try {
      const params = new URLSearchParams({
        sort: sortOrder === 'newest' ? 'newest' : 'oldest',
        ...(showFavoritesOnly && { favorites: 'true' })
      });

      const response = await fetch(`/api/albums/${album.id}/photos?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }
      
      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error('Error fetching photos:', error);
    }
  };

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const navigateToPhoto = (index: number) => {
    setCurrentPhotoIndex(index);
  };

  const filteredPhotos = showFavoritesOnly 
    ? photos.filter(photo => favorites.includes(photo.id))
    : photos;

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push('/')} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Album not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">
          <Home className="h-4 w-4" />
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">{album.name}</span>
      </nav>

      {/* Album Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{album.name}</h1>
            {album.description && (
              <p className="text-muted-foreground text-lg mb-4">{album.description}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Image className="h-4 w-4" />
                <span>{t('photos_in_this_album', { count: album.photoCount })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              <Heart className="h-4 w-4 mr-2" />
              {showFavoritesOnly ? t('all_photos') : t('favorites_only')}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortOrder === 'newest' ? t('oldest_first') : t('newest_first')}
            </Button>
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      {filteredPhotos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {filteredPhotos.map((photo, index) => (
            <div key={photo.id} className="relative group">
              <div 
                className="relative aspect-square overflow-hidden rounded-lg bg-muted cursor-pointer"
                onClick={() => openLightbox(index)}
              >
                <PhotoImage
                  photoId={photo.id}
                  filename={photo.filename}
                  size="small"
                  blurhash={photo.blurhash}
                  className="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
                />
                
                {/* Favorite button overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <FavoriteButton photoId={photo.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No photos found</h3>
            <p className="text-muted-foreground">
              {showFavoritesOnly 
                ? "No favorite photos in this album"
                : "This album doesn't contain any photos yet."
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      <Lightbox
        photos={filteredPhotos}
        currentIndex={currentPhotoIndex}
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        onNavigate={navigateToPhoto}
      />
    </div>
  );
}
