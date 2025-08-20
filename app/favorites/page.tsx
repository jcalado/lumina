'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, ArrowLeft } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';
import { Lightbox } from '@/components/Gallery/Lightbox';
import { useFavorites } from '@/contexts/FavoritesContext';

interface Photo {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  url: string;
  album: {
    id: string;
    name: string;
    path: string;
  };
}

export default function FavoritesPage() {
  const { favorites } = useFavorites();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    fetchFavoritePhotos();
  }, [favorites]);

  const fetchFavoritePhotos = async () => {
    if (favorites.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/photos/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photoIds: favorites }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch favorite photos');
      }

      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      console.error('Error fetching favorite photos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading favorites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/" className="text-blue-600 hover:text-blue-800">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Heart className="h-8 w-8 text-red-500 fill-red-500" />
            Favorite Photos
          </h1>
          <p className="text-muted-foreground mt-1">
            {favorites.length} {favorites.length === 1 ? 'photo' : 'photos'} in your favorites
          </p>
        </div>
      </div>

      {/* Photos Grid */}
      {favorites.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Favorite Photos</CardTitle>
            <CardDescription>
              Start adding photos to your favorites by clicking the heart icon on any photo.
            </CardDescription>
          </CardContent>
        </Card>
      ) : photos.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Heart className="h-16 w-16 mx-auto text-red-500 fill-red-500 mb-4" />
            <CardTitle className="mb-2">Favorite Photos Not Available</CardTitle>
            <CardDescription>
              Some of your favorite photos may no longer be accessible or may have been moved.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative group">
              <div 
                className="relative aspect-square overflow-hidden rounded-lg cursor-pointer"
                onClick={() => openLightbox(index)}
              >
                <PhotoImage
                  photoId={photo.id}
                  filename={photo.filename}
                  alt={photo.filename}
                  size="medium"
                  className="object-cover w-full h-full transition-transform group-hover:scale-105"
                />
                
                {/* Overlay with photo info */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200" />
                
                {/* Favorite button */}
                <div className="absolute top-2 right-2">
                  <FavoriteButton 
                    photoId={photo.id}
                  />
                </div>
                
                {/* Photo info overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-sm font-medium truncate">
                    {photo.filename}
                  </p>
                  <p className="text-white/80 text-xs truncate">
                    {photo.album.name}
                  </p>
                  {photo.takenAt && (
                    <p className="text-white/70 text-xs">
                      {new Date(photo.takenAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox - for future use */}
      {photos.length > 0 && (
        <Lightbox
          photos={photos}
          currentIndex={currentPhotoIndex}
          isOpen={lightboxOpen}
          onClose={closeLightbox}
          onNavigate={navigateToPhoto}
        />
      )}
    </div>
  );
}
