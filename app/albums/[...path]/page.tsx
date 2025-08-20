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
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const initializePage = async () => {
      const resolvedParams = await params;
      // Decode each path segment before joining
      const decodedSegments = resolvedParams.path.map(segment => decodeURIComponent(segment));
      const path = decodedSegments.join('/');
      console.log('Raw URL params:', resolvedParams.path);
      console.log('Decoded segments:', decodedSegments);
      console.log('Joined path for albumPath:', path);
      console.log('albumPath set to:', path);
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
      // Encode each path segment individually to preserve the URL structure
      const encodedPath = albumPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const url = `/api/albums/${encodedPath}`;
      console.log('Fetching album from URL:', url);
      console.log('Album path:', albumPath);
      
      const response = await fetch(url);
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Album data received:', data);
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

  const downloadAlbum = async () => {
    if (!albumData || isDownloading) return;
    
    try {
      setIsDownloading(true);
      
      console.log('Starting download for album path:', albumPath);
      console.log('albumPath type:', typeof albumPath);
      console.log('albumPath length:', albumPath.length);
      console.log('albumPath JSON:', JSON.stringify(albumPath));
      
      const response = await fetch('/api/download/album', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          albumPath: albumPath
        }),
      });
      
      console.log('Download response status:', response.status);
      console.log('Download response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download failed with status:', response.status, 'Error:', errorText);
        throw new Error(`Failed to download album: ${response.status} - ${errorText}`);
      }
      
      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${albumData.album.name}-photos.zip`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Create blob and download
      console.log('Creating blob from response...');
      const blob = await response.blob();
      console.log('Blob created, size:', blob.size, 'type:', blob.type);
      
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      console.log('Starting download with filename:', filename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      console.log('Download completed successfully');
      
    } catch (error) {
      console.error('Error downloading album:', error);
      alert('Failed to download album. Please try again.');
    } finally {
      setIsDownloading(false);
    }
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
            <Button 
              variant="outline" 
              onClick={downloadAlbum}
              disabled={isDownloading}
            >
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? 'Downloading...' : 'Download Album'}
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
