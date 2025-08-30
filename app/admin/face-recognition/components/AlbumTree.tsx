'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';

interface AlbumTreeNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  totalPhotos: number;
  unprocessedPhotos: number;
  depth: number;
  children: AlbumTreeNode[];
}

interface AlbumTreeProps {
  albums: AlbumTreeNode[];
  selectedAlbumIds: Set<string>;
  expandedAlbums: Set<string>;
  onToggleSelection: (albumId: string) => void;
  onToggleExpansion: (albumId: string) => void;
}

export function AlbumTree({ albums, selectedAlbumIds, expandedAlbums, onToggleSelection, onToggleExpansion }: AlbumTreeProps) {
  const renderAlbumNode = (album: AlbumTreeNode) => {
    const hasChildren = album.children && album.children.length > 0;
    const isExpanded = expandedAlbums.has(album.id);
    const isSelected = selectedAlbumIds.has(album.id);
    const indentLevel = album.depth * 20; // 20px per level for clearer tree

    return (
      <div key={album.id}>
        <div
          className="flex items-center justify-between px-3 py-2 border-b hover:bg-muted/30 cursor-pointer"
          style={{ paddingLeft: `${indentLevel + 12}px` }}
          onClick={() => onToggleSelection(album.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpansion(album.id); }}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <div className="w-6" />
            )}
            <FolderOpen className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <Checkbox checked={isSelected} onChange={() => {}} />
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{album.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {album.unprocessedPhotos} of {album.totalPhotos} need processing
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs flex-shrink-0">{album.totalPhotos} total</Badge>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {album.children.map(child => renderAlbumNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {albums.map(album => renderAlbumNode(album))}
    </div>
  );
}
