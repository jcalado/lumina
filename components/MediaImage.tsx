'use client';

import { PhotoImage } from './PhotoImage';
import { VideoImage } from './VideoImage';

export type MediaType = 'photo' | 'video';

export interface MediaItem {
  id: string;
  type: MediaType;
  filename: string;
  orientation?: number;
  blurhash?: string | null;
}

interface MediaImageProps {
  media: MediaItem;
  className?: string;
  alt?: string;
  size?: 'small' | 'medium' | 'large';
  lazy?: boolean;
}

export function MediaImage({ 
  media, 
  className = '', 
  alt, 
  size = 'small',
  lazy = true
}: MediaImageProps) {
  if (media.type === 'video') {
    return (
      <VideoImage
        videoId={media.id}
        filename={media.filename}
        className={className}
        alt={alt}
        size={size}
        lazy={lazy}
      />
    );
  }

  return (
    <PhotoImage
      photoId={media.id}
      filename={media.filename}
      className={className}
      alt={alt}
      size={size}
      lazy={lazy}
      blurhash={media.blurhash}
      orientation={media.orientation}
    />
  );
}
