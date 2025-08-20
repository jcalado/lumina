'use client';

import { Heart } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  photoId: string;
  className?: string;
}

export function FavoriteButton({ photoId, className }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(photoId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(photoId);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "p-1 bg-black/50 rounded-full transition-opacity hover:bg-black/70",
        className
      )}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart 
        className={cn(
          "h-4 w-4 transition-colors",
          favorite 
            ? "text-red-500 fill-red-500" 
            : "text-white"
        )} 
      />
    </button>
  );
}
