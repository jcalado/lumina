'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface DownloadSelectionContextType {
  selectedPhotos: string[];
  addToDownload: (photoId: string) => void;
  removeFromDownload: (photoId: string) => void;
  isSelectedForDownload: (photoId: string) => boolean;
  toggleDownloadSelection: (photoId: string) => void;
  clearAllDownloadSelections: () => void;
  getSelectedCount: () => number;
}

const DownloadSelectionContext = createContext<DownloadSelectionContextType | undefined>(undefined);

export const useDownloadSelection = () => {
  const context = useContext(DownloadSelectionContext);
  if (context === undefined) {
    throw new Error('useDownloadSelection must be used within a DownloadSelectionProvider');
  }
  return context;
};

interface DownloadSelectionProviderProps {
  children: ReactNode;
}

export function DownloadSelectionProvider({ children }: DownloadSelectionProviderProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  // Load from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem('download-selected-photos');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSelectedPhotos(parsed);
        }
      } catch (error) {
        console.error('Error parsing download selection from localStorage:', error);
      }
    }
  }, []);

  // Save to localStorage whenever selection changes
  useEffect(() => {
    localStorage.setItem('download-selected-photos', JSON.stringify(selectedPhotos));
  }, [selectedPhotos]);

  const addToDownload = (photoId: string) => {
    setSelectedPhotos(prev => {
      if (prev.includes(photoId)) {
        return prev;
      }
      return [...prev, photoId];
    });
  };

  const removeFromDownload = (photoId: string) => {
    setSelectedPhotos(prev => prev.filter(id => id !== photoId));
  };

  const isSelectedForDownload = (photoId: string) => {
    return selectedPhotos.includes(photoId);
  };

  const toggleDownloadSelection = (photoId: string) => {
    if (isSelectedForDownload(photoId)) {
      removeFromDownload(photoId);
    } else {
      addToDownload(photoId);
    }
  };

  const clearAllDownloadSelections = () => {
    setSelectedPhotos([]);
  };

  const getSelectedCount = () => {
    return selectedPhotos.length;
  };

  return (
    <DownloadSelectionContext.Provider
      value={{
        selectedPhotos,
        addToDownload,
        removeFromDownload,
        isSelectedForDownload,
        toggleDownloadSelection,
        clearAllDownloadSelections,
        getSelectedCount,
      }}
    >
      {children}
    </DownloadSelectionContext.Provider>
  );
}
