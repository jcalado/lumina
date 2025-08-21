'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function AlbumSlugPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndRedirect = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get the album by slug to get the path
        const slugResponse = await fetch(`/api/albums/by-slug/${slug}`);
        if (!slugResponse.ok) {
          if (slugResponse.status === 404) {
            setError('Album not found');
          } else {
            throw new Error('Failed to fetch album');
          }
          return;
        }
        
        const slugData = await slugResponse.json();
        const albumPath = slugData.album.path;
        
        // Redirect to the hierarchical URL
        router.push(`/albums/${encodeURIComponent(albumPath)}`);
      } catch (error) {
        console.error('Error fetching album:', error);
        setError('Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchAndRedirect();
    }
  }, [slug, router]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Redirecting...</div>
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

  return null;
}

export default function AlbumSlugPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('albums');
  const slug = params.slug as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [subAlbums, setSubAlbums] = useState<SubAlbum[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const { favorites } = useFavorites();

  useEffect(() => {
    const fetchAndRedirect = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get the album by slug to get the path
        const slugResponse = await fetch(`/api/albums/by-slug/${slug}`);
        if (!slugResponse.ok) {
          if (slugResponse.status === 404) {
            setError('Album not found');
          } else {
            throw new Error('Failed to fetch album');
          }
          return;
        }
        
        const slugData = await slugResponse.json();
        const albumPath = slugData.album.path;
        
        // Redirect to the hierarchical URL
        router.push(`/albums/${encodeURIComponent(albumPath)}`);
      } catch (error) {
        console.error('Error fetching album:', error);
        setError('Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    if (slug) {
      fetchAndRedirect();
    }
  }, [slug, router]);

  useEffect(() => {
    if (album && album.photoCount > 0) {
      fetchPhotos();
    }
  }, [album, showFavoritesOnly, sortOrder]);

  const fetchAlbumDataBySlug = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First get the album by slug to get the path
      const slugResponse = await fetch(`/api/albums/by-slug/${slug}`);
      if (!slugResponse.ok) {
        if (slugResponse.status === 404) {
          setError('Album not found');
        } else {
          throw new Error('Failed to fetch album');
        }
        return;
      }
      
      const slugData = await slugResponse.json();
      const albumPath = slugData.album.path;
      
      // Now get the full album data with sub-albums using the path-based API
      const pathResponse = await fetch(`/api/albums/${encodeURIComponent(albumPath)}`);
      if (!pathResponse.ok) {
        throw new Error('Failed to fetch album details');
      }
      
      const pathData = await pathResponse.json();
      setAlbum(pathData.album);
      setSubAlbums(pathData.subAlbums || []);
      setPhotos(pathData.photos || []);
    } catch (error) {
      console.error('Error fetching album:', error);
      setError('Failed to load album');
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    // Photos are now fetched as part of the main album data
    // This function can be used for refreshing photos with different filters/sorting
    if (!album) return;

    try {
      const params = new URLSearchParams({
        sortBy: sortOrder === 'newest' ? 'desc' : 'asc',
        ...(showFavoritesOnly && { favorites: 'true' })
      });

      const response = await fetch(`/api/albums/${encodeURIComponent(album.path)}?${params}`);
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
      {/* Breadcrumb Navigation */}
      {album && (
        <nav className="flex items-center space-x-1 text-sm text-muted-foreground mb-6">
          <Link href="/" className="flex items-center hover:text-foreground transition-colors">
            <Home className="h-4 w-4 mr-1" />
            Home
          </Link>
          
          {album.path.split('/').map((segment, index, segments) => {
            const isLast = index === segments.length - 1;
            // Build the path up to this segment
            const pathUpToSegment = segments.slice(0, index + 1).join('/');
            
            return (
              <div key={index} className="flex items-center">
                <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50" />
                {isLast ? (
                  <span className="text-foreground font-medium">{decodeURIComponent(segment)}</span>
                ) : (
                  <Link 
                    href={`/albums/${encodeURIComponent(pathUpToSegment)}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {decodeURIComponent(segment)}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      )}

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
              {subAlbums.length > 0 && (
                <div className="flex items-center gap-1">
                  <Folder className="h-4 w-4" />
                  <span>{subAlbums.length} sub-album{subAlbums.length !== 1 ? 's' : ''}</span>
                </div>
              )}
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

      {/* Sub-albums Grid */}
      {subAlbums.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Folder className="h-5 w-5" />
            Sub-albums
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {subAlbums.map((subAlbum) => {
              const href = `/albums/${encodeURIComponent(subAlbum.path)}`;
              return (
                <Link key={subAlbum.id} href={href}>
                  <Card className="group hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="aspect-video bg-muted rounded-lg mb-3 overflow-hidden">
                        {subAlbum.thumbnails.length > 0 ? (
                        <ScrubThumbnail
                          thumbnails={subAlbum.thumbnails}
                          albumName={subAlbum.name}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Folder className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium group-hover:text-blue-600 transition-colors line-clamp-2">
                      {subAlbum.name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                      <div className="flex items-center gap-1">
                        <Images className="h-3 w-3" />
                        <span>{subAlbum.totalPhotoCount || subAlbum.photoCount}</span>
                      </div>
                      {subAlbum.subAlbumsCount > 0 && (
                        <div className="flex items-center gap-1">
                          <Folder className="h-3 w-3" />
                          <span>{subAlbum.subAlbumsCount}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
              );
            })}
          </div>
        </div>
      )}

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
      ) : filteredPhotos.length === 0 && subAlbums.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No content found</h3>
            <p className="text-muted-foreground">
              {showFavoritesOnly 
                ? "No favorite photos in this album"
                : "This album doesn't contain any photos or sub-albums yet."
              }
            </p>
          </CardContent>
        </Card>
      ) : null}

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
