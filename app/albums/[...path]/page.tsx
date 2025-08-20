'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Image, Download, Heart, Folder, Images } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { Lightbox } from '@/components/Gallery/Lightbox';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';

import { useTranslations } from 'next-intl';

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
  thumbnails: {
    photoId: string;
    filename: string;
  }[];
  dateRange?: {
    earliest: string | null;
    latest: string | null;
  } | null;
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

// Component for scrubbing thumbnails
interface ScrubThumbnailProps {
  thumbnails: { photoId: string; filename: string }[];
  albumName: string;
}

function ScrubThumbnail({ thumbnails, albumName }: ScrubThumbnailProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || thumbnails.length <= 1) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const progress = Math.max(0, Math.min(1, x / width));
    const index = Math.floor(progress * thumbnails.length);
    const clampedIndex = Math.max(0, Math.min(thumbnails.length - 1, index));

    console.log(`Scrubbing: x=${x}, width=${width}, progress=${progress}, index=${clampedIndex}`);
    setCurrentIndex(clampedIndex);
  };

  const handleMouseEnter = () => {
    console.log(`Mouse entered ${albumName} scrub area`);
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    console.log(`Mouse left ${albumName} scrub area`);
    setIsHovering(false);
    setCurrentIndex(0); // Reset to first image when not hovering
  };

  if (thumbnails.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
        <Folder className="w-12 h-12 text-muted-foreground/50" />
      </div>
    );
  }

  const currentThumbnail = thumbnails[currentIndex];
  console.log(`${albumName}: Rendering thumbnail ${currentIndex + 1}/${thumbnails.length} - ${currentThumbnail?.photoId}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden cursor-pointer"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <PhotoImage
        photoId={currentThumbnail.photoId}
        filename={currentThumbnail.filename}
        size="medium"
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
        alt={`Thumbnail ${currentIndex + 1} for ${albumName}`}
      />

      {/* Progress indicator - only show when hovering and multiple images */}
      {isHovering && thumbnails.length > 1 && (
        <div className="absolute bottom-2 left-2 right-2">
          <div className="flex gap-1">
            {thumbnails.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all duration-200 ${index === currentIndex ? 'bg-white shadow-lg' : 'bg-white/40'
                  }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Image counter - show in top right when hovering */}
      {/* {isHovering && thumbnails.length > 1 && (
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
          {currentIndex + 1}/{thumbnails.length}
        </div>
      )} */}

    </div>
  );
}

// Utility function to format date range
function formatDateRange(dateRange: { earliest: string | null; latest: string | null } | null | undefined): string {
  if (!dateRange || !dateRange.earliest) {
    return '';
  }

  const earliest = new Date(dateRange.earliest);
  const latest = dateRange.latest ? new Date(dateRange.latest) : earliest;

  const earliestMonth = earliest.toLocaleString('default', { month: 'long' });
  const earliestYear = earliest.getFullYear();
  const latestMonth = latest.toLocaleString('default', { month: 'long' });
  const latestYear = latest.getFullYear();

  // Same month and year
  if (earliestMonth === latestMonth && earliestYear === latestYear) {
    return `${earliestMonth} ${earliestYear}`;
  }

  // Same year, different months
  if (earliestYear === latestYear) {
    return `${earliestMonth} - ${latestMonth} ${earliestYear}`;
  }

  // Different years
  return `${earliestMonth} ${earliestYear} - ${latestMonth} ${latestYear}`;
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

  const t = useTranslations('albums');

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
          <div>
            <h1 className="text-3xl font-bold">{album.name}</h1>
            {album.description && (
              <p className="text-muted-foreground mt-1">{album.description}</p>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground mt-1">
              <span>{t('photos_in_this_album', { count: album.photoCount })}</span>
              {album.totalPhotoCount && album.totalPhotoCount > album.photoCount && (
                <span>{album.totalPhotoCount} total photos (including sub-albums)</span>
              )}
              {album.subAlbumsCount > 0 && (
                <span>{album.subAlbumsCount} sub-albums</span>
              )}
            </div>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
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
          <h2 className="text-xl font-semibold mb-4">Albums</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {subAlbums.map((subAlbum) => (
              <div key={subAlbum.id} className="relative">
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="p-0">
                    {/* Thumbnail Image */}
                    <div className="aspect-[4/3] bg-muted relative overflow-hidden rounded-t-lg">
                      <ScrubThumbnail
                        thumbnails={subAlbum.thumbnails}
                        albumName={subAlbum.name}
                      />

                      {/* Overlay with folder icon and badges - pointer-events-none to allow scrubbing */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
                        <div className="absolute top-2 left-2 pointer-events-auto">
                          <div className="bg-black/60 rounded-full p-1.5">
                            <Images className="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-1 pointer-events-auto">
                          {subAlbum.totalPhotoCount && subAlbum.totalPhotoCount > 0 && (
                            <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                              <Image className="w-3 h-3 mr-1" />
                              {subAlbum.totalPhotoCount}
                            </Badge>
                          )}
                          {subAlbum.subAlbumsCount && subAlbum.subAlbumsCount > 0 && (
                            <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                              <Folder className="w-3 h-3 mr-1" />
                              {subAlbum.subAlbumsCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Album Details - This area will handle the link navigation */}
                    <Link href={`/albums/${encodeURIComponent(subAlbum.path)}`}>
                      <div className="p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-medium text-sm line-clamp-2 flex-1">
                            {subAlbum.name}
                          </h3>
                          {subAlbum.dateRange && formatDateRange(subAlbum.dateRange) && (
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {formatDateRange(subAlbum.dateRange)}
                            </span>
                          )}
                        </div>
                        {subAlbum.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {subAlbum.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="cursor-pointer"
                onClick={() => openLightbox(index)}
              >
                <Card className="group hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    <div className="aspect-square bg-muted rounded-md relative overflow-hidden">
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
