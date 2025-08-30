'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Grid3X3,
  Cpu,
  Trash2,
  CheckCircle,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface UnassignedFace {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  photo: {
    id: string;
    filename: string;
    thumbnails: Array<{
      id: string;
      photoId: string;
      size: string;
      s3Key: string;
      width: number;
      height: number;
    }>;
  };
  ignored?: boolean;
}

interface UnassignedFacesProps {
  unassignedFaces: UnassignedFace[];
  unassignedLoading: boolean;
  unassignedPage: number;
  unassignedLimit: number;
  unassignedPagination: any;
  selectedFaces: Set<string>;
  processingUnassigned: boolean;
  deletingUnassignedFaces: boolean;
  similarityThreshold: number;
  processMode: 'create_new' | 'assign_existing' | 'both';
  groupingLimit: number;
  showingSimilar: boolean;
  similarFilterThreshold: number;
  onProcessUnassignedFaces: () => void;
  onDeleteAllUnassignedFaces: () => void;
  onIgnoreSelectedFaces: () => void;
  onShowSimilarForSelected: () => void;
  onClearSimilarFilter: () => void;
  onToggleFaceSelection: (faceId: string) => void;
  onSimilarityThresholdChange: (value: number) => void;
  onProcessModeChange: (value: 'create_new' | 'assign_existing' | 'both') => void;
  onGroupingLimitChange: (value: number) => void;
  onSimilarFilterThresholdChange: (value: number) => void;
  onPageChange: (newPage: number) => void;
}

export function UnassignedFaces({
  unassignedFaces,
  unassignedLoading,
  unassignedPage,
  unassignedLimit,
  unassignedPagination,
  selectedFaces,
  processingUnassigned,
  deletingUnassignedFaces,
  similarityThreshold,
  processMode,
  groupingLimit,
  showingSimilar,
  similarFilterThreshold,
  onProcessUnassignedFaces,
  onDeleteAllUnassignedFaces,
  onIgnoreSelectedFaces,
  onShowSimilarForSelected,
  onClearSimilarFilter,
  onToggleFaceSelection,
  onSimilarityThresholdChange,
  onProcessModeChange,
  onGroupingLimitChange,
  onSimilarFilterThresholdChange,
  onPageChange,
}: UnassignedFacesProps) {
  // Progress tracking state
  const [processingProgress, setProcessingProgress] = useState<{
    isActive: boolean;
    jobId?: string;
    currentBatch: number;
    totalBatches: number;
    facesProcessed: number;
    totalFaces: number;
    targetFaceCount: number;
    status: string;
  } | null>(null);

  // Progress polling effect
  useEffect(() => {
    if (!processingProgress?.isActive || !processingProgress.jobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/faces/process-unassigned?jobId=${processingProgress.jobId}`);
        if (response.ok) {
          const progress = await response.json();
          setProcessingProgress(progress);

          if (progress.status === 'Completed' || progress.status === 'Failed' || progress.status === 'Cancelled') {
            // Refresh the unassigned faces list
            onPageChange(unassignedPage);
            if (progress.status === 'Completed') {
              setTimeout(() => setProcessingProgress(null), 3000); // Show completion for 3 seconds
            } else {
              setProcessingProgress(null);
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll progress:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [processingProgress?.isActive, processingProgress?.jobId, onPageChange, unassignedPage]);

  // Handle continuous processing start
  const handleStartContinuousProcessing = async () => {
    const initialFaceCount = unassignedPagination?.total ?? unassignedFaces.length;

    try {
      const response = await fetch('/api/admin/faces/process-unassigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          continuous: true,
          similarityThreshold,
          mode: processMode,
          limit: 500, // Batch size
          targetFaceCount: Math.floor(initialFaceCount * 0.1), // Stop at <10%
        })
      });

      if (response.ok) {
        const { jobId, initialFaceCount: totalFaces, targetFaceCount } = await response.json();
        setProcessingProgress({
          isActive: true,
          jobId,
          currentBatch: 0,
          totalBatches: Math.ceil((totalFaces - targetFaceCount) / 500),
          facesProcessed: 0,
          totalFaces,
          targetFaceCount,
          status: 'Starting continuous processing...',
        });
      } else {
        const error = await response.json();
        alert(`Failed to start processing: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to start processing:', error);
      alert('Failed to start processing');
    }
  };

  // Handle processing cancellation
  const handleCancelProcessing = async () => {
    if (!processingProgress?.jobId) return;

    try {
      await fetch(`/api/admin/faces/process-unassigned?jobId=${processingProgress.jobId}`, {
        method: 'DELETE'
      });
      setProcessingProgress(null);
    } catch (error) {
      console.error('Failed to cancel processing:', error);
    }
  };
  return (
    <div className="mt-8">
      <h3 className="text-lg font-medium flex items-center gap-2 mb-4">
        <Grid3X3 className="h-5 w-5" />
        Unassigned Faces
      </h3>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Process Unassigned Faces with Settings */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={processingProgress?.isActive || unassignedFaces.length === 0}>
                {processingProgress?.isActive ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Cpu className="h-4 w-4 mr-2" />
                )}
                Continuous Process
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>🚀 Continuous Face Processing</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4">
                    <p>Start continuous batch processing of unassigned faces. The system will process faces in batches until reaching the target threshold, with real-time progress tracking.</p>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="similarity-threshold">Similarity Threshold: {Math.round(similarityThreshold * 100)}%</Label>
                        <Slider
                          id="similarity-threshold"
                          min={0.3}
                          max={0.95}
                          step={0.05}
                          value={[similarityThreshold]}
                          onValueChange={(value) => onSimilarityThresholdChange(value[0])}
                          className="mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Higher values require more similarity for matching</p>
                      </div>

                      <div>
                        <Label>Processing Mode</Label>
                        <div className="mt-2 space-y-2">
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="processMode"
                              value="both"
                              checked={processMode === 'both'}
                              onChange={(e) => onProcessModeChange(e.target.value as any)}
                            />
                            <span className="text-sm font-medium">Smart Mode (Recommended)</span>
                          </label>
                          <p className="text-xs text-muted-foreground ml-6">Automatically match to existing people or create new ones</p>

                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="processMode"
                              value="assign_existing"
                              checked={processMode === 'assign_existing'}
                              onChange={(e) => onProcessModeChange(e.target.value as any)}
                            />
                            <span className="text-sm">Match Only</span>
                          </label>
                          <p className="text-xs text-muted-foreground ml-6">Only match to existing people</p>
                        </div>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>💡 Continuous Processing:</strong> Processes faces in batches of 500 until reaching 10% of original count. Progress is tracked in real-time with cancellation support.
                        </p>
                      </div>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleStartContinuousProcessing} className="bg-blue-600 hover:bg-blue-700">
                  🚀 Start Continuous Processing
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete All Unassigned Faces */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deletingUnassignedFaces || unassignedFaces.length === 0}>
                {deletingUnassignedFaces ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Unassigned
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete All Unassigned Faces?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all {unassignedFaces.length} unassigned faces.
                  You may want to process them first to create people.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteAllUnassignedFaces} className="bg-destructive hover:bg-destructive/90">
                  Delete All Unassigned Faces
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Toolbar: ignore + similar filter */}
          <div className="flex items-center gap-2 ml-2">
            <Button variant="outline" size="sm" disabled={unassignedLoading || selectedFaces.size === 0} onClick={onIgnoreSelectedFaces}>
              Ignore Selected
            </Button>
            <Button variant="outline" size="sm" disabled={unassignedLoading || selectedFaces.size === 0} onClick={onShowSimilarForSelected}>
              Show Similar
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Similarity
              <Slider
                min={0.3}
                max={0.95}
                step={0.05}
                value={[similarFilterThreshold]}
                onValueChange={(value) => onSimilarFilterThresholdChange(value[0])}
                className="w-40"
              />
              <span className="w-10 text-right">{Math.round(similarFilterThreshold * 100)}%</span>
            </div>
            {showingSimilar && (
              <Button variant="ghost" size="sm" onClick={onClearSimilarFilter}>
                Clear Filter
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Display */}
      {processingProgress && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="font-medium">Processing Faces</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelProcessing}
                className="text-destructive hover:text-destructive"
              >
                Cancel
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{processingProgress.facesProcessed} / {processingProgress.totalFaces} faces</span>
              </div>
              <Progress
                value={(processingProgress.facesProcessed / processingProgress.totalFaces) * 100}
                className="h-2"
              />

              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Batch {processingProgress.currentBatch} of {processingProgress.totalBatches}</span>
                <span>{Math.max(0, processingProgress.totalFaces - processingProgress.facesProcessed)} faces remaining</span>
              </div>

              <p className="text-xs text-muted-foreground mt-2">{processingProgress.status}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            {/* Overlay loader to avoid layout shift */}
            {unassignedLoading && (
              <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] z-10 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  <span className="text-sm text-muted-foreground">Loading unassigned faces…</span>
                </div>
              </div>
            )}

            {unassignedFaces.length === 0 && !unassignedLoading ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h4 className="font-medium mb-2">All Faces Assigned</h4>
                <p className="text-muted-foreground">All detected faces have been assigned to people</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Click faces to select them for grouping into a person. Selected: {selectedFaces.size}
                  </p>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {unassignedFaces.map((face) => (
                      <div
                        key={face.id}
                        className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                          selectedFaces.has(face.id)
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => onToggleFaceSelection(face.id)}
                      >
                        <div className="aspect-square bg-gray-100">
                          <img
                            src={`/api/faces/${face.id}/serve`}
                            alt={`face-${face.id}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {face.ignored && (
                          <div className="absolute top-1 left-1 bg-yellow-100 text-yellow-800 text-xs px-1 rounded">
                            Ignored
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Page {unassignedPagination?.page ?? unassignedPage} of {unassignedPagination?.totalPages ?? 1} · {unassignedPagination?.total ?? unassignedFaces.length} faces
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unassignedLoading || ((unassignedPagination?.page ?? unassignedPage) <= 1)}
                        onClick={() => onPageChange((unassignedPagination?.page ?? unassignedPage) - 1)}
                      >
                        Prev
                      </Button>
                      {/* Page selector for quick jump */}
                      <Select
                        value={String(unassignedPagination?.page ?? unassignedPage)}
                        onValueChange={(value) => onPageChange(parseInt(value))}
                        disabled={unassignedLoading}
                      >
                        <SelectTrigger className="w-20 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: unassignedPagination?.totalPages ?? 1 }, (_, i) => i + 1).map((pageNum) => (
                            <SelectItem key={pageNum} value={String(pageNum)}>
                              {pageNum}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unassignedLoading || !(unassignedPagination?.hasMore ?? false)}
                        onClick={() => onPageChange((unassignedPagination?.page ?? unassignedPage) + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
