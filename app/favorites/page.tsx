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
      // For now, we'll just show empty state since we need to implement the batch photos API
      setPhotos([]);
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
      ) : (
        <Card className="text-center py-16">
          <CardContent>
            <Heart className="h-16 w-16 mx-auto text-red-500 fill-red-500 mb-4" />
            <CardTitle className="mb-2">Favorites Feature Ready</CardTitle>
            <CardDescription>
              You have {favorites.length} favorite photos. The display functionality will be completed in the next phase.
            </CardDescription>
          </CardContent>
        </Card>
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
