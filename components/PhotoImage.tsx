'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Image as ImageIcon } from 'lucide-react';

interface PhotoImageProps {
  photoId: string;
  filename: string;
  className?: string;
  alt?: string;
  size?: 'small' | 'medium' | 'large';
  lazy?: boolean;
}

export function PhotoImage({ 
  photoId, 
  filename, 
  className = '', 
  alt, 
  size = 'small',
  lazy = true 
}: PhotoImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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

    const loadImage = () => {
      setLoading(true);
      setError(false);
      setImageUrl(`/api/photos/${photoId}/serve?size=${size}`);
    };

    loadImage();
  }, [photoId, size, inView]);

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    setError(true);
    setLoading(false);
  };

  return (
    <div ref={imgRef} className={`relative overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {imageUrl && inView && (
        <Image
          src={imageUrl}
          alt={alt || filename}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
    </div>
  );
}
