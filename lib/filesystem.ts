import fs from 'fs/promises';
import path from 'path';
import { readFile } from 'fs/promises';
import { isImageFile, isVideoFile, isMediaFile } from './utils';
import exifr from 'exifr';

export interface VideoMetadata {
  filename: string;
  size: number;
  duration?: number; // in seconds
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  takenAt?: Date;
}

export interface PhotoMetadata {
  filename: string;
  size: number;
  takenAt?: Date;
  camera?: string;
  lens?: string;
  orientation?: number; // EXIF orientation value (1-8)
  settings?: {
    iso?: number;
    aperture?: string;
    shutter?: string;
    focalLength?: string;
  };
  gps?: {
    latitude: number;
    longitude: number;
  };
}

export interface AlbumData {
  path: string;
  name: string;
  description?: string;
  photos: PhotoMetadata[];
  videos: VideoMetadata[];
  subAlbums: string[];
}

export class FileSystemScanner {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async scanDirectory(relativePath: string = ''): Promise<AlbumData> {
    const fullPath = path.join(this.rootPath, relativePath);
    const albumName = path.basename(fullPath) || 'Root';
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const photos: PhotoMetadata[] = [];
      const videos: VideoMetadata[] = [];
      const subAlbums: string[] = [];
      
      // Process files and directories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          subAlbums.push(entry.name);
        } else if (entry.isFile() && isImageFile(entry.name)) {
          const photoPath = path.join(fullPath, entry.name);
          const metadata = await this.extractPhotoMetadata(photoPath);
          photos.push(metadata);
        } else if (entry.isFile() && isVideoFile(entry.name)) {
          const videoPath = path.join(fullPath, entry.name);
          const metadata = await this.extractVideoMetadata(videoPath);
          videos.push(metadata);
        }
      }
      
      // Read description from project.md if it exists
      const description = await this.readProjectDescription(fullPath);
      
      return {
        path: relativePath,
        name: albumName,
        description,
        photos: photos.sort((a, b) => (a.takenAt || new Date(0)).getTime() - (b.takenAt || new Date(0)).getTime()),
        videos: videos.sort((a, b) => (a.takenAt || new Date(0)).getTime() - (b.takenAt || new Date(0)).getTime()),
        subAlbums: subAlbums.sort(),
      };
    } catch (error) {
      console.error(`Error scanning directory ${fullPath}:`, error);
      throw new Error(`Failed to scan directory: ${relativePath}`);
    }
  }

  async extractPhotoMetadata(filePath: string): Promise<PhotoMetadata> {
    try {
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);
      
      // Extract EXIF data
      const exifData = await exifr.parse(filePath, {
        pick: [
          'DateTimeOriginal', 'CreateDate', 'ModifyDate',
          'Make', 'Model', 'LensModel',
          'ISO', 'FNumber', 'ExposureTime', 'FocalLength',
          'GPSLatitude', 'GPSLongitude', 'Orientation'
        ]
      });
      
      const metadata: PhotoMetadata = {
        filename,
        size: stats.size,
      };
      
      // Extract date taken
      if (exifData?.DateTimeOriginal) {
        metadata.takenAt = new Date(exifData.DateTimeOriginal);
      } else if (exifData?.CreateDate) {
        metadata.takenAt = new Date(exifData.CreateDate);
      } else if (exifData?.ModifyDate) {
        metadata.takenAt = new Date(exifData.ModifyDate);
      }
      
      // Extract camera info
      if (exifData?.Make && exifData?.Model) {
        metadata.camera = `${exifData.Make} ${exifData.Model}`;
      }
      
      if (exifData?.LensModel) {
        metadata.lens = exifData.LensModel;
      }
      
      // Extract orientation
      if (exifData?.Orientation) {
        metadata.orientation = exifData.Orientation;
      }
      
      // Extract camera settings
      metadata.settings = {};
      if (exifData?.ISO) metadata.settings.iso = exifData.ISO;
      if (exifData?.FNumber) metadata.settings.aperture = `f/${exifData.FNumber}`;
      if (exifData?.ExposureTime) {
        metadata.settings.shutter = exifData.ExposureTime < 1 
          ? `1/${Math.round(1 / exifData.ExposureTime)}`
          : `${exifData.ExposureTime}s`;
      }
      if (exifData?.FocalLength) metadata.settings.focalLength = `${exifData.FocalLength}mm`;
      
      // Extract GPS data
      if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
        metadata.gps = {
          latitude: exifData.GPSLatitude,
          longitude: exifData.GPSLongitude,
        };
      }
      
      return metadata;
    } catch (error) {
      console.error(`Error extracting metadata from ${filePath}:`, error);
      return {
        filename: path.basename(filePath),
        size: 0,
      };
    }
  }

  async extractVideoMetadata(filePath: string): Promise<VideoMetadata> {
    try {
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);
      
      const metadata: VideoMetadata = {
        filename,
        size: stats.size,
      };
      
      // For now, we'll return basic metadata
      // TODO: Add video metadata extraction using a library like ffprobe
      // This would require installing ffmpeg and a Node.js wrapper
      
      return metadata;
    } catch (error) {
      console.error(`Error extracting video metadata from ${filePath}:`, error);
      return {
        filename: path.basename(filePath),
        size: 0,
      };
    }
  }

  private async readProjectDescription(albumPath: string): Promise<string | undefined> {
    try {
      const projectPath = path.join(albumPath, 'project.md');
      const content = await readFile(projectPath, 'utf-8');
      return content.trim();
    } catch {
      // File doesn't exist or can't be read
      return undefined;
    }
  }

  async getAllAlbums(): Promise<string[]> {
    const albums: string[] = [];
    
    const scanRecursive = async (currentPath: string) => {
      const fullPath = path.join(this.rootPath, currentPath);
      
      try {
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        
        // Check if this directory contains photos/videos OR subdirectories
        const hasMedia = entries.some((entry: any) => 
          entry.isFile() && isMediaFile(entry.name)
        );
        
        const hasSubdirectories = entries.some((entry: any) => entry.isDirectory());
        
        // Add this directory as an album if it has media OR if it's not the root and has subdirectories
        if (hasMedia || (currentPath && hasSubdirectories)) {
          albums.push(currentPath);
        }
        
        // Always recurse into subdirectories to find nested albums
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            await scanRecursive(subPath);
          }
        }
      } catch (error) {
        console.error(`Error scanning ${fullPath}:`, error);
      }
    };
    
    await scanRecursive('');
    return albums.sort();
  }

  // Lightweight media counter for a directory (recursive)
  async countMedia(relativePath: string): Promise<{ photos: number; videos: number; total: number }> {
    const fullPath = path.join(this.rootPath, relativePath);
    let photos = 0;
    let videos = 0;
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          if (isImageFile(entry.name)) photos++;
          else if (isVideoFile(entry.name)) videos++;
        } else if (entry.isDirectory()) {
          const subPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const sub = await this.countMedia(subPath);
          photos += sub.photos;
          videos += sub.videos;
        }
      }
    } catch (error) {
      console.error(`Error counting media in ${fullPath}:`, error);
    }
    return { photos, videos, total: photos + videos };
  }
}

export const scanner = new FileSystemScanner(process.env.PHOTOS_ROOT_PATH || '');
