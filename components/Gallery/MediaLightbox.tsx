'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Info, Check, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PhotoExifInfo } from '@/components/Gallery/PhotoExifInfo';
import { useDownloadSelection } from '@/contexts/DownloadSelectionContext';

interface Video {
  id: string;
  filename: string;
  originalPath: string | null;
  s3Key: string;
  fileSize: number;
  duration?: number;
  width?: number;
  height?: number;
  takenAt: string | null;
  createdAt: string;
  metadata?: string | null;
}

interface Media {
  id: string;
  type: 'photo' | 'video';
  filename: string;
  originalPath: string | null;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  metadata?: string | null;
  orientation?: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  originalUrl?: string;
}

interface MediaLightboxProps {
  media: Media[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function MediaLightbox({ media, currentIndex, isOpen, onClose, onNavigate }: MediaLightboxProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isSelectedForDownload, toggleDownloadSelection } = useDownloadSelection();

  const currentMedia = media[currentIndex];
  const isVideo = currentMedia?.type === 'video';

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (currentIndex > 0) {
          onNavigate(currentIndex - 1);
        }
        break;
      case 'ArrowRight':
        if (currentIndex < media.length - 1) {
          onNavigate(currentIndex + 1);
        }
        break;
      case 'i':
      case 'I':
        setShowMetadata(!showMetadata);
        break;
      case ' ':
        if (isVideo && videoRef.current) {
          event.preventDefault();
          if (isPlaying) {
            videoRef.current.pause();
          } else {
            videoRef.current.play();
          }
        }
        break;
    }
  }, [isOpen, currentIndex, media.length, onNavigate, onClose, showMetadata, isVideo, isPlaying]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset media loading state when media changes
  useEffect(() => {
    setMediaLoading(true);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [currentIndex]);

  // Video event handlers
  const handleVideoLoad = () => {
    setMediaLoading(false);
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleVideoPlay = () => {
    setIsPlaying(true);
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current && duration > 0) {
      setProgress((videoRef.current.currentTime / duration) * 100);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen || !currentMedia) return null;

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < media.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };

  const handleDownload = () => {
    const endpoint = isVideo ? `/api/videos/${currentMedia.id}/download` : `/api/photos/${currentMedia.id}/download`;
    const link = document.createElement('a');
    link.href = endpoint;
    link.download = currentMedia.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 !mb-0 bg-black bg-opacity-95 flex items-center justify-center">
      {/* Background overlay */}
      <div 
        className="absolute inset-0" 
        onClick={onClose}
      />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium truncate">
              {currentMedia.filename}
            </h2>
            <span className="text-sm text-gray-300">
              {currentIndex + 1} of {media.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleDownloadSelection(currentMedia.id)}
              className={`text-white hover:bg-white/20 ${
                isSelectedForDownload(currentMedia.id) ? 'bg-white/20' : ''
              }`}
              title={isSelectedForDownload(currentMedia.id) ? 'Remove from download selection' : 'Add to download selection'}
            >
              {isSelectedForDownload(currentMedia.id) ? (
                <Check className="h-4 w-4 text-blue-400" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMetadata(!showMetadata)}
              className="text-white hover:bg-white/20"
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:bg-white/20"
              title={`Download this ${isVideo ? 'video' : 'photo'}`}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      {currentIndex > 0 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrevious}
          className="absolute left-4 z-10 text-white hover:bg-white/20 h-12 w-12"
        >
          <ChevronLeft className="h-8 w-8" />
        </Button>
      )}
      
      {currentIndex < media.length - 1 && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          className="absolute right-4 z-10 text-white hover:bg-white/20 h-12 w-12"
        >
          <ChevronRight className="h-8 w-8" />
        </Button>
      )}

      {/* Main media container */}
      <div className="relative max-w-screen-lg max-h-screen w-full h-full flex items-center justify-center p-4">
        {mediaLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
        
        {isVideo ? (
          <div className="relative">
            <video
              ref={videoRef}
              src={currentMedia.originalUrl || `/api/videos/${currentMedia.id}/serve?size=original`}
              className="max-w-full max-h-full object-contain"
              onLoadedData={handleVideoLoad}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              onError={() => setMediaLoading(false)}
              controls={false}
            />
            
            {/* Custom video controls */}
            <div className="absolute bottom-4 left-4 right-4 bg-black/50 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePlayPause}
                  className="text-white hover:bg-white/20"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                
                <div className="flex-1">
                  <div className="bg-white/20 rounded-full h-2 relative">
                    <div 
                      className="bg-white rounded-full h-2 transition-all" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                
                <div className="text-white text-sm">
                  {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <img
            src={currentMedia.originalUrl || `/api/photos/${currentMedia.id}/serve?size=large`}
            alt={currentMedia.filename}
            className="max-w-full max-h-full object-contain"
            onLoad={() => setMediaLoading(false)}
            onError={() => setMediaLoading(false)}
          />
        )}
      </div>

      {/* Metadata panel */}
      {showMetadata && (
        <div className="absolute bottom-4 right-4 z-20">
          {isVideo ? (
            <Card className="w-96 max-h-[80vh] overflow-hidden">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-2">Video Information</h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Filename:</strong> {currentMedia.filename}</div>
                  <div><strong>File Size:</strong> {(currentMedia.fileSize / 1024 / 1024).toFixed(2)} MB</div>
                  {currentMedia.duration && (
                    <div><strong>Duration:</strong> {formatTime(currentMedia.duration)}</div>
                  )}
                  {currentMedia.width && currentMedia.height && (
                    <div><strong>Resolution:</strong> {currentMedia.width} × {currentMedia.height}</div>
                  )}
                  {currentMedia.takenAt && (
                    <div><strong>Date Taken:</strong> {new Date(currentMedia.takenAt).toLocaleDateString()}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <PhotoExifInfo
              photo={{
                id: currentMedia.id,
                filename: currentMedia.filename,
                fileSize: currentMedia.fileSize,
                takenAt: currentMedia.takenAt,
                createdAt: currentMedia.createdAt,
                metadata: currentMedia.metadata || null,
                orientation: currentMedia.orientation,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
