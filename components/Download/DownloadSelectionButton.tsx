'use client';

import { Download } from 'lucide-react';
import { useDownloadSelection } from '@/contexts/DownloadSelectionContext';
import { cn } from '@/lib/utils';

interface DownloadSelectionButtonProps {
  photoId: string;
  className?: string;
}

export function DownloadSelectionButton({ photoId, className }: DownloadSelectionButtonProps) {
  const { isSelectedForDownload, toggleDownloadSelection } = useDownloadSelection();
  const selected = isSelectedForDownload(photoId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDownloadSelection(photoId);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "p-1 bg-black/50 rounded-full transition-all hover:bg-black/70",
        className
      )}
      aria-label={selected ? 'Remove from download selection' : 'Add to download selection'}
    >
      <Download 
        className={cn(
          "h-4 w-4 transition-colors",
          selected 
            ? "text-blue-500 fill-blue-500" 
            : "text-white"
        )} 
      />
    </button>
  );
}
