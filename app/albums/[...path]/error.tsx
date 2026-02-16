'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, ImageIcon } from 'lucide-react';

export default function AlbumError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="text-center py-16">
      <Card className="max-w-md mx-auto">
        <CardContent className="py-16">
          <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <CardTitle className="mb-2">Something went wrong</CardTitle>
          <CardDescription className="mb-4">
            {error.message || 'Failed to load album'}
          </CardDescription>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
