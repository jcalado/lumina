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
