'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Image, Download, Heart, Folder } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { Lightbox } from '@/components/Gallery/Lightbox';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';

interface Photo {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
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
  name: string;
  description: string | null;
  photoCount: number;
  totalPhotoCount?: number;
  subAlbumsCount?: number;
}

interface AlbumData {
  album: Album;
  subAlbums: Album[];
  photos: Photo[];
}

interface AlbumPageProps {
  params: Promise<{
    path: string[];
  }>;
}

export default function AlbumPage({ params }: AlbumPageProps) {
  const router = useRouter();
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumPath, setAlbumPath] = useState<string>('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    const initializePage = async () => {
      const resolvedParams = await params;
      const path = resolvedParams.path.join('/');
      setAlbumPath(path);
    };
    
    initializePage();
  }, [params]);

  useEffect(() => {
    if (albumPath) {
      fetchAlbum();
    }
  }, [albumPath]);

  const fetchAlbum = async () => {
    try {
      const response = await fetch(`/api/albums/${encodeURIComponent(albumPath)}`);
      if (response.ok) {
        const data = await response.json();
        setAlbumData(data);
      } else if (response.status === 404) {
        setError('Album not found');
      } else if (response.status === 403) {
        setError('Album not accessible');
      } else {
        setError('Failed to load album');
      }
    } catch (error) {
      console.error('Error fetching album:', error);
      setError('Failed to load album');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading album...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <Card className="max-w-md mx-auto">
          <CardContent className="py-16">
            <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">Album Error</CardTitle>
            <CardDescription className="mb-4">{error}</CardDescription>
            <Button onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!albumData) {
    return null;
  }

  const { album, subAlbums, photos } = albumData;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{album.name}</h1>
            {album.description && (
              <p className="text-muted-foreground mt-1">{album.description}</p>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground mt-1">
              <span>{album.photoCount} photos in this album</span>
              {album.totalPhotoCount && album.totalPhotoCount > album.photoCount && (
                <span>{album.totalPhotoCount} total photos (including sub-albums)</span>
              )}
              {album.subAlbumsCount && album.subAlbumsCount > 0 && (
                <span>{album.subAlbumsCount} sub-albums</span>
              )}
            </div>
          </div>
        </div>
        
        {photos.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Album
            </Button>
          </div>
        )}
      </div>

      {/* Sub-albums */}
      {subAlbums.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Sub-albums</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {subAlbums.map((subAlbum) => (
              <Link key={subAlbum.id} href={`/albums/${encodeURIComponent(subAlbum.path)}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Folder className="w-6 h-6 text-blue-600" />
                      <div className="flex gap-1">
                        {subAlbum.totalPhotoCount && subAlbum.totalPhotoCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            <Image className="w-3 h-3 mr-1" />
                            {subAlbum.totalPhotoCount}
                          </Badge>
                        )}
                        {subAlbum.subAlbumsCount && subAlbum.subAlbumsCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Folder className="w-3 h-3 mr-1" />
                            {subAlbum.subAlbumsCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-medium text-sm mb-1 line-clamp-2">
                      {subAlbum.name}
                    </h3>
                    {subAlbum.description && (
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {subAlbum.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Photos Grid */}
      {photos.length === 0 && subAlbums.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Folder className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">Empty Album</CardTitle>
            <CardDescription>
              This album doesn't contain any photos or sub-albums yet.
            </CardDescription>
          </CardContent>
        </Card>
      ) : photos.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Photos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="cursor-pointer"
                onClick={() => openLightbox(index)}
              >
                <Card className="group hover:shadow-lg transition-shadow">
                  <CardContent className="p-2">
                    <div className="aspect-square bg-muted rounded-md mb-2 relative overflow-hidden">
                      <PhotoImage
                        photoId={photo.id}
                        filename={photo.filename}
                        className="aspect-square rounded-md"
                        alt={`Photo ${photo.filename}`}
                      />
                      
                      {/* Favorite button overlay */}
                      <FavoriteButton 
                        photoId={photo.id}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm font-medium truncate">{photo.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {photo.takenAt 
                          ? new Date(photo.takenAt).toLocaleDateString()
                          : new Date(photo.createdAt).toLocaleDateString()
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Lightbox */}
      <Lightbox
        photos={photos}
        currentIndex={currentPhotoIndex}
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        onNavigate={navigateToPhoto}
      />
    </div>
  );
}
