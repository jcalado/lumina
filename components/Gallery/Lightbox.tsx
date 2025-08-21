'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PhotoExifInfo } from './PhotoExifInfo';

interface Photo {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  metadata?: string | null;
  orientation?: number;
}

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ photos, currentIndex, isOpen, onClose, onNavigate }: LightboxProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const currentPhoto = photos[currentIndex];

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (currentIndex > 0) {
          onNavigate(currentIndex - 1);
        }
        break;
      case 'ArrowRight':
        if (currentIndex < photos.length - 1) {
          onNavigate(currentIndex + 1);
        }
        break;
      case 'i':
      case 'I':
        setShowMetadata(!showMetadata);
        break;
    }
  }, [isOpen, currentIndex, photos.length, onNavigate, onClose, showMetadata]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset image loading state when photo changes
  useEffect(() => {
    setImageLoading(true);
  }, [currentIndex]);

  if (!isOpen || !currentPhoto) return null;

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < photos.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/photos/${currentPhoto.id}/download`;
    link.download = currentPhoto.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 !mb-0 bg-black bg-opacity-95 flex items-center justify-center">
      {/* Background overlay */}
      <div 
        className="absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium truncate">
              {currentPhoto.filename}
            </h2>
            <span className="text-sm text-gray-300">
              {currentIndex + 1} of {photos.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMetadata(!showMetadata)}
              className="text-white hover:bg-white/20"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      {currentIndex > 0 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevious}
          className="absolute left-4 z-10 text-white hover:bg-white/20 h-12 w-12"
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
      )}
      
      {currentIndex < photos.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          className="absolute right-4 z-10 text-white hover:bg-white/20 h-12 w-12"
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      )}

      {/* Main image container */}
      <div className="relative max-w-screen-lg max-h-screen w-full h-full flex items-center justify-center p-4">
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
        
        <img
          src={`/api/photos/${currentPhoto.id}/serve?size=large`}
          alt={currentPhoto.filename}
          className="max-w-full max-h-full object-contain"
          onLoad={() => setImageLoading(false)}
          onError={() => setImageLoading(false)}
        />
      </div>

      {/* Metadata panel */}
      {showMetadata && (
        <div className="absolute bottom-4 right-4 z-20">
          <PhotoExifInfo photo={currentPhoto} />
        </div>
      )}

      {/* Footer with thumbnails - disabled */}
      {/* <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/50 to-transparent">
        <div className="flex gap-2 overflow-x-auto justify-center">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              onClick={() => onNavigate(index)}
              className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                index === currentIndex 
                  ? 'border-white' 
                  : 'border-transparent hover:border-gray-400'
              }`}
            >
              <img
                src={`/api/photos/${photo.id}/serve?size=small`}
                alt={photo.filename}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div> */}
    </div>
  );
}
