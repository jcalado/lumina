import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import path from 'path';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext || '');
}

export function isVideoFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'flv', 'wmv'].includes(ext || '');
}

export function isMediaFile(filename: string): boolean {
  return isImageFile(filename) || isVideoFile(filename);
}

export function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    case '.mkv':
      return 'video/x-matroska';
    case '.webm':
      return 'video/webm';
    case '.m4v':
      return 'video/x-m4v';
    case '.3gp':
      return 'video/3gpp';
    case '.flv':
      return 'video/x-flv';
    case '.wmv':
      return 'video/x-ms-wmv';
    default:
      return 'application/octet-stream';
  }
}
