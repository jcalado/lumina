'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Image, Download, Heart, Folder, Images, ChevronRight, Home, ArrowUpDown, Filter } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { Lightbox } from '@/components/Gallery/Lightbox';
import { FavoriteButton } from '@/components/Favorites/FavoriteButton';
import { DownloadSelectionButton } from '@/components/Download/DownloadSelectionButton';
import { SelectedPhotosDownload } from '@/components/Download/SelectedPhotosDownload';
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
  orientation?: number; // EXIF orientation value (1-8)
  metadata?: string | null; // JSON string containing EXIF data
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
  slugPath?: string;
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
  pagination?: {
    page: number;
    limit: number;
    totalPhotos: number;
    totalPages: number;
    hasMore: boolean;
  };
}

interface AlbumPageProps {
  params: Promise<{
    path: string[];
  }>;
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

// Breadcrumb component
interface BreadcrumbProps {
  albumPath: string;
}

function Breadcrumb({ albumPath }: BreadcrumbProps) {
  const [breadcrumbItems, setBreadcrumbItems] = useState([
    {
      name: 'Home',
      path: '',
      href: '/',
      icon: Home,
    },
  ]);

  useEffect(() => {
    const buildBreadcrumbs = async () => {
      const pathSegments = albumPath ? albumPath.split('/') : [];
      const items = [
        {
          name: 'Home',
          path: '',
          href: '/',
          icon: Home,
        },
      ];

      if (pathSegments.length === 0) {
        setBreadcrumbItems(items);
        return;
      }

      // Build all path combinations for breadcrumbs
      const paths = [];
      for (let i = 0; i < pathSegments.length; i++) {
        const currentPath = pathSegments.slice(0, i + 1).join('/');
        paths.push(currentPath);
      }

      try {
        // Call the API to get album names and slug paths
        const response = await fetch('/api/albums/breadcrumbs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paths }),
        });

        if (response.ok) {
          const data = await response.json();
          
          data.breadcrumbs.forEach((breadcrumb: any) => {
            items.push({
              name: breadcrumb.name,
              path: breadcrumb.path,
              href: breadcrumb.href,
              icon: Folder,
            });
          });
        } else {
          // Fallback to path segments if API fails
          pathSegments.forEach((segment, index) => {
            const currentPath = pathSegments.slice(0, index + 1).join('/');
            items.push({
              name: decodeURIComponent(segment),
              path: currentPath,
              href: `/albums/${encodeURIComponent(currentPath)}`,
              icon: Folder,
            });
          });
        }
      } catch (error) {
        console.error('Error fetching breadcrumb data:', error);
        // Fallback to path segments
        pathSegments.forEach((segment, index) => {
          const currentPath = pathSegments.slice(0, index + 1).join('/');
          items.push({
            name: decodeURIComponent(segment),
            path: currentPath,
            href: `/albums/${encodeURIComponent(currentPath)}`,
            icon: Folder,
          });
        });
      }

      setBreadcrumbItems(items);
    };

    buildBreadcrumbs();
  }, [albumPath]);

  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-4">
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;
        const Icon = item.icon;
        
        return (
          <div key={item.path} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50" />
            )}
            
            {isLast ? (
              // Current page - not clickable
              <div className="flex items-center text-foreground font-medium">
                <Icon className="h-4 w-4 mr-1" />
                {item.name}
              </div>
            ) : (
              // Clickable breadcrumb link
              <Link 
                href={item.href}
                className="flex items-center hover:text-foreground transition-colors"
              >
                <Icon className="h-4 w-4 mr-1" />
                {item.name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function AlbumPage({ params }: AlbumPageProps) {
  const router = useRouter();
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [albumPath, setAlbumPath] = useState<string>('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const t = useTranslations('albums');
  const { favorites, isFavorite } = useFavorites();

  // Intersection observer ref for infinite scroll
  const observerRef = useRef<HTMLDivElement>(null);

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
      // Reset pagination when album path or sort order changes
      setCurrentPage(1);
      setAllPhotos([]);
      setHasMore(true);
      fetchAlbum(1, true);
    }
  }, [albumPath, sortOrder]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!observerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMorePhotos();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading]);

  const fetchAlbum = async (page: number = 1, isInitial: boolean = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Encode each path segment individually to preserve the URL structure
      const encodedPath = albumPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
      const queryParams = new URLSearchParams();
      queryParams.set('sortBy', sortOrder);
      queryParams.set('page', page.toString());
      const url = `/api/albums/${encodedPath}?${queryParams.toString()}`;
      console.log('Fetching album from URL:', url);

      const response = await fetch(url);
      console.log('Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Album data received:', data);
        
        if (isInitial) {
          setAlbumData(data);
          setAllPhotos(data.photos);
        } else {
          // Append new photos for infinite scroll
          setAllPhotos(prev => [...prev, ...data.photos]);
        }

        // Update pagination state
        if (data.pagination) {
          setHasMore(data.pagination.hasMore);
          setCurrentPage(data.pagination.page);
        } else {
          setHasMore(false);
        }
      } else if (response.status === 404) {
        setError('Album not found');
      } else if (response.status === 403) {
        setError('Album not accessible');
      } else {
        // Try to get error details from response
        try {
          const errorData = await response.json();
          console.error('Server error response:', errorData);
          setError(`Failed to load album: ${errorData.details || errorData.error || 'Unknown error'}`);
        } catch {
          setError(`Failed to load album (Status: ${response.status})`);
        }
      }
    } catch (error) {
      console.error('Error fetching album:', error);
      setError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMorePhotos = async () => {
    if (hasMore && !loadingMore) {
      await fetchAlbum(currentPage + 1, false);
    }
  };

  // Filter photos based on favorites selection
  const filteredPhotos = allPhotos.filter(photo => {
    if (showFavoritesOnly) {
      return isFavorite(photo.id);
    }
    return true;
  });

  // Destructure album data for easier access
  const album = albumData?.album;
  const subAlbums = albumData?.subAlbums || [];
  const photos = filteredPhotos; // For lightbox compatibility

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

  const openLightbox = (filteredIndex: number) => {
    // Find the original photo index in the full photos array
    const filteredPhoto = filteredPhotos[filteredIndex];
    const originalIndex = allPhotos.findIndex(p => p.id === filteredPhoto.id);
    setCurrentPhotoIndex(originalIndex);
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
      {/* Breadcrumb Navigation */}
      <Breadcrumb albumPath={albumPath} />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{album?.name}</h1>
          {album?.description && (
            <p className="text-muted-foreground mt-1">{album.description}</p>
          )}
          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
            {/* <span>{t('photos_in_this_album', { count: album?.photoCount || 0 })}</span> */}
            {album?.totalPhotoCount && album.totalPhotoCount > (album.photoCount || 0) && (
              <span>{album.totalPhotoCount} {t('photos')}</span>
            )}
            {/* {album?.subAlbumsCount && album.subAlbumsCount > 0 && (
              <span>{album.subAlbumsCount} sub-albums</span>
            )} */}
          </div>
        </div>

        {filteredPhotos.length > 0 && (
          <div className="flex gap-2">
            <button
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4 py-2 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
              onClick={downloadAlbum}
              disabled={isDownloading}
            >
              <Download className="h-4 w-4" />
              {isDownloading ? 'Downloading...' : t('download_album')}
            </button>
          </div>
        )}
      </div>

      {/* Filter and Sort Controls */}
      {photos.length > 0 && (
        <div className="flex gap-2 items-center p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('sort_by_date')}</span>
            <button
              className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
                sortOrder === 'asc' 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setSortOrder('asc')}
            >
              {t('oldest_first')}
            </button>
            <button
              className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
                sortOrder === 'desc' 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setSortOrder('desc')}
            >
              {t('newest_first')}
            </button>
          </div>
          
          <div className="h-4 w-px bg-border mx-2" />
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('show')}</span>
            <button
              className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium ${
                !showFavoritesOnly 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setShowFavoritesOnly(false)}
            >
              {t('all_photos')}
            </button>
            <button
              className={`h-8 rounded-md px-3 text-xs inline-flex items-center justify-center transition-colors font-medium gap-1 ${
                showFavoritesOnly 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
              onClick={() => setShowFavoritesOnly(true)}
            >
              <Heart className="h-3 w-3" />
              {t('favorites_only')}
            </button>
          </div>
        </div>
      )}

      {/* Sub-albums */}
      {subAlbums.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Albums</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {subAlbums.map((subAlbum) => (
              <div key={subAlbum.id} className="relative">
                <Link href={`/albums/${subAlbum.slugPath || encodeURIComponent(subAlbum.path)}`}>
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

                      {/* Album Details */}
                      <div className="p-4">
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
                    </CardContent>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photos Grid */}
      {filteredPhotos.length === 0 && albumData?.subAlbums.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Folder className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">Empty Album</CardTitle>
            <CardDescription>
              This album doesn't contain any photos or sub-albums yet.
            </CardDescription>
          </CardContent>
        </Card>
      ) : showFavoritesOnly && filteredPhotos.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Favorites</CardTitle>
            <CardDescription>
              You haven't marked any photos as favorites in this album yet.
            </CardDescription>
          </CardContent>
        </Card>
      ) : filteredPhotos.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Photos {showFavoritesOnly && <span className="text-muted-foreground">({filteredPhotos.length} favorites)</span>}
            {albumData?.pagination && !showFavoritesOnly && (
              <span className="text-muted-foreground text-base font-normal ml-2">
                ({filteredPhotos.length} of {albumData.pagination.totalPhotos})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {filteredPhotos.map((photo, index) => (
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
                        blurhash={photo.blurhash}
                        orientation={photo.orientation}
                      />

                      {/* Action buttons overlay */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DownloadSelectionButton
                          photoId={photo.id}
                        />
                        <FavoriteButton
                          photoId={photo.id}
                        />
                      </div>
                    </div>

                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Infinite scroll observer element */}
          {hasMore && (
            <div ref={observerRef} className="mt-8 flex justify-center">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span>Loading more photos...</span>
                </div>
              ) : (
                <div className="h-20" /> // Trigger area for intersection observer
              )}
            </div>
          )}

          {!hasMore && allPhotos.length > 0 && !showFavoritesOnly && (
            <div className="mt-8 text-center text-muted-foreground">
              <p>You've seen all {albumData?.pagination?.totalPhotos || allPhotos.length} photos in this album</p>
            </div>
          )}
        </div>
      ) : null}

      {/* Lightbox */}
      <Lightbox
        photos={allPhotos}
        currentIndex={currentPhotoIndex}
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        onNavigate={navigateToPhoto}
      />

      {/* Selected Photos Download */}
      <SelectedPhotosDownload albumPath={albumPath} />
    </div>
  );
}
