'use client';

import { useState, useRef } from 'react';
import { Folder } from 'lucide-react';
import { PhotoImage } from '@/components/PhotoImage';
import { MediaImage } from '@/components/MediaImage';

interface MediaThumbnail {
  mediaId: string;
  filename: string;
  mediaType: 'photo' | 'video';
}

interface PhotoThumbnail {
  photoId: string;
  filename: string;
}

interface ScrubThumbnailProps {
  thumbnails: (MediaThumbnail | PhotoThumbnail)[];
  albumName: string;
}

export function ScrubThumbnail({ thumbnails, albumName }: ScrubThumbnailProps) {
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

    setCurrentIndex(clampedIndex);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovering(true);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
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

  // Handle backward compatibility
  const isMediaThumbnail = (thumb: MediaThumbnail | PhotoThumbnail): thumb is MediaThumbnail => {
    return 'mediaId' in thumb;
  };

  const renderMediaImage = () => {
    if (isMediaThumbnail(currentThumbnail)) {
      const mediaThumbnail = currentThumbnail as MediaThumbnail;
      return (
        <MediaImage
          media={{
            id: mediaThumbnail.mediaId,
            filename: mediaThumbnail.filename,
            type: mediaThumbnail.mediaType,
          }}
          size="medium"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          alt={`Thumbnail ${currentIndex + 1} for ${albumName}`}
        />
      );
    } else {
      // Fallback to PhotoImage for old format
      const photoThumbnail = currentThumbnail as PhotoThumbnail;
      return (
        <PhotoImage
          photoId={photoThumbnail.photoId}
          filename={photoThumbnail.filename}
          size="medium"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          alt={`Thumbnail ${currentIndex + 1} for ${albumName}`}
        />
      );
    }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onMouseMove={thumbnails.length > 1 ? handleMouseMove : undefined}
      onMouseEnter={thumbnails.length > 1 ? handleMouseEnter : undefined}
      onMouseLeave={thumbnails.length > 1 ? handleMouseLeave : undefined}
    >
      {renderMediaImage()}

      {/* Progress indicator - only show when hovering and multiple images */}
      {isHovering && thumbnails.length > 1 && (
        <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
          <div className="flex gap-1">
            {thumbnails.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                  index === currentIndex ? 'bg-white shadow-lg' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
