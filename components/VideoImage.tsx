'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { PlayCircle, Video } from 'lucide-react';

interface VideoImageProps {
  videoId: string;
  filename: string;
  className?: string;
  alt?: string;
  size?: 'small' | 'medium' | 'large';
  lazy?: boolean;
  showPlayIcon?: boolean;
}

export function VideoImage({ 
  videoId, 
  filename, 
  className = '', 
  alt, 
  size = 'small',
  lazy = true,
  showPlayIcon = true
}: VideoImageProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(!lazy);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!lazy || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, inView]);

  useEffect(() => {
    if (!inView) return;

    const loadThumbnail = () => {
      setLoading(true);
      setError(false);
      // For now, use the video serve endpoint with size parameter
      // Later this will serve the video thumbnail
      setThumbnailUrl(`/api/videos/${videoId}/serve?size=${size}`);
    };

    loadThumbnail();
  }, [videoId, size, inView]);

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    setError(true);
    setLoading(false);
  };

  return (
    <div ref={imgRef} className={`relative overflow-hidden ${className}`}>
      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Video className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {thumbnailUrl && inView && (
        <Image
          src={thumbnailUrl}
          alt={alt || filename}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Play icon overlay */}
      {showPlayIcon && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/50 rounded-full p-2">
            <PlayCircle className="h-8 w-8 text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
