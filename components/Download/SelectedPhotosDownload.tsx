'use client';

import { useState } from 'react';
import { Download, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDownloadSelection } from '@/contexts/DownloadSelectionContext';
import { cn } from '@/lib/utils';

interface SelectedPhotosDownloadProps {
  albumPath: string;
  className?: string;
}

export function SelectedPhotosDownload({ albumPath, className }: SelectedPhotosDownloadProps) {
  const { selectedPhotos, clearAllDownloadSelections, getSelectedCount } = useDownloadSelection();
  const [isDownloading, setIsDownloading] = useState(false);
  const selectedCount = getSelectedCount();

  if (selectedCount === 0) {
    return null;
  }

  const handleDownloadSelected = async () => {
    if (selectedPhotos.length === 0) return;

    setIsDownloading(true);
    try {
      const response = await fetch('/api/albums/download-selected', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          photoIds: selectedPhotos,
          albumPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      // Get the filename from the Content-Disposition header if available
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'selected-photos.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Clear selections after successful download
      clearAllDownloadSelections();
    } catch (error) {
      console.error('Error downloading selected photos:', error);
      alert('Failed to download photos. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card className={cn("fixed bottom-4 right-4 z-40 shadow-lg", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-500" />
            <span className="font-medium text-sm">
              {selectedCount} photo{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={handleDownloadSelected}
              disabled={isDownloading}
              className="h-8 px-3"
            >
              {isDownloading ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllDownloadSelections}
              className="h-8 w-8 p-0"
              aria-label="Clear all selections"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
