import fs from 'fs/promises';
import path from 'path';
import { readFile } from 'fs/promises';
import { isImageFile } from './utils';
import exifr from 'exifr';

export interface PhotoMetadata {
  filename: string;
  size: number;
  takenAt?: Date;
  camera?: string;
  lens?: string;
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
      const subAlbums: string[] = [];
      
      // Process files and directories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          subAlbums.push(entry.name);
        } else if (entry.isFile() && isImageFile(entry.name)) {
          const photoPath = path.join(fullPath, entry.name);
          const metadata = await this.extractPhotoMetadata(photoPath);
          photos.push(metadata);
        }
      }
      
      // Read description from project.md if it exists
      const description = await this.readProjectDescription(fullPath);
      
      return {
        path: relativePath,
        name: albumName,
        description,
        photos: photos.sort((a, b) => (a.takenAt || new Date(0)).getTime() - (b.takenAt || new Date(0)).getTime()),
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
          'GPSLatitude', 'GPSLongitude'
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
        
        // Check if this directory contains photos OR subdirectories
        const hasPhotos = entries.some((entry: any) => 
          entry.isFile() && isImageFile(entry.name)
        );
        
        const hasSubdirectories = entries.some((entry: any) => entry.isDirectory());
        
        // Add this directory as an album if it has photos OR if it's not the root and has subdirectories
        if (hasPhotos || (currentPath && hasSubdirectories)) {
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
}

export const scanner = new FileSystemScanner(process.env.PHOTOS_ROOT_PATH || '');
