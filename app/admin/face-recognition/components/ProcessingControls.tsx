'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlbumTree } from './AlbumTree';
import { Play, ChevronDown, Cpu, Trash2, FolderOpen } from 'lucide-react';

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

interface ProcessingControlsProps {
  availableAlbums: AlbumTreeNode[];
  selectedAlbumIds: Set<string>;
  expandedAlbums: Set<string>;
  albumsLoading: boolean;
  isProcessing: boolean;
  onToggleAlbumSelection: (albumId: string) => void;
  onToggleAlbumExpansion: (albumId: string) => void;
  onStartProcessing: (mode: 'new_only' | 'reprocess_keep_people' | 'reprocess_remove_all') => void;
}

export function ProcessingControls({
  availableAlbums,
  selectedAlbumIds,
  expandedAlbums,
  albumsLoading,
  isProcessing,
  onToggleAlbumSelection,
  onToggleAlbumExpansion,
  onStartProcessing,
}: ProcessingControlsProps) {
  const selectedCount = selectedAlbumIds.size;
  const totalPhotos = availableAlbums.reduce((sum, album) => sum + album.totalPhotos, 0);
  const selectedPhotos = availableAlbums
    .filter(album => selectedAlbumIds.has(album.id))
    .reduce((sum, album) => sum + album.totalPhotos, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Album Selection
          {selectedCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {selectedCount} selected ({selectedPhotos} photos)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedAlbumIds.size === availableAlbums.length && availableAlbums.length > 0}
            onCheckedChange={(checked) => {
              if (checked) {
                const allIds = new Set(availableAlbums.map(album => album.id));
                availableAlbums.forEach(album => onToggleAlbumSelection(album.id));
              } else {
                selectedAlbumIds.forEach(id => onToggleAlbumSelection(id));
              }
            }}
          />
          <span className="text-sm font-medium">Select All Albums</span>
          <Badge variant="outline" className="ml-2">
            {totalPhotos} total photos
          </Badge>
        </div>

        <div className="border rounded-lg max-h-96 overflow-y-auto">
          {albumsLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading albums...</p>
            </div>
          ) : availableAlbums.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No albums with photos found
            </p>
          ) : (
            <AlbumTree
              albums={availableAlbums}
              selectedAlbumIds={selectedAlbumIds}
              expandedAlbums={expandedAlbums}
              onToggleSelection={onToggleAlbumSelection}
              onToggleExpansion={onToggleAlbumExpansion}
            />
          )}
        </div>

        <div className="flex gap-4">
          {/* Processing Mode Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="flex items-center gap-2"
                disabled={isProcessing || selectedCount === 0}
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isProcessing ? 'Processing...' : 'Start Face Processing'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Processing Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onStartProcessing('new_only')} disabled={isProcessing}>
                <Play className="h-4 w-4 mr-2" />
                <div>
                  <div className="font-medium">Process New Photos Only</div>
                  <div className="text-xs text-muted-foreground">Process photos that haven't been analyzed yet</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isProcessing}>
                    <Cpu className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">Reprocess All Photos (Keep People)</div>
                      <div className="text-xs text-muted-foreground">Re-detect faces but keep existing people for re-matching</div>
                    </div>
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reprocess All Photos (Keep People)?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will:
                      <br />• Delete all detected faces
                      <br />• Keep existing people (they may be re-matched to new faces)
                      <br />• Reprocess all photos to detect faces again
                      <br /><br />
                      Existing people will remain but may end up with different faces assigned to them.
                      Are you sure you want to continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onStartProcessing('reprocess_keep_people')}
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      Reprocess (Keep People)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isProcessing}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">Reprocess All Photos (Remove All)</div>
                      <div className="text-xs text-muted-foreground">Clear all faces and people, then reprocess everything</div>
                    </div>
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reprocess All Photos (Remove All)?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will permanently delete ALL existing data:
                      <br />• All detected faces
                      <br />• All people and their groupings
                      <br />• All face recognition assignments
                      <br /><br />
                      Then it will reprocess all photos from scratch to detect and group faces again.
                      This operation cannot be undone. Are you sure you want to continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onStartProcessing('reprocess_remove_all')}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Reprocess (Remove All)
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
