import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
