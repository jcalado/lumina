'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FavoritesContextType {
  favorites: string[];
  addFavorite: (photoId: string) => void;
  removeFavorite: (photoId: string) => void;
  isFavorite: (photoId: string) => boolean;
  toggleFavorite: (photoId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}

interface FavoritesProviderProps {
  children: ReactNode;
}

export function FavoritesProvider({ children }: FavoritesProviderProps) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('photo-gallery-favorites');
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading favorites from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem('photo-gallery-favorites', JSON.stringify(favorites));
      } catch (error) {
        console.error('Error saving favorites to localStorage:', error);
      }
    }
  }, [favorites, isLoaded]);

  const addFavorite = (photoId: string) => {
    setFavorites(prev => {
      if (!prev.includes(photoId)) {
        return [...prev, photoId];
      }
      return prev;
    });
  };

  const removeFavorite = (photoId: string) => {
    setFavorites(prev => prev.filter(id => id !== photoId));
  };

  const isFavorite = (photoId: string) => {
    return favorites.includes(photoId);
  };

  const toggleFavorite = (photoId: string) => {
    if (isFavorite(photoId)) {
      removeFavorite(photoId);
    } else {
      addFavorite(photoId);
    }
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        toggleFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}
