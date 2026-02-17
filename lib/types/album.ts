export interface ThumbnailData {
  size: string;
  s3Key: string;
  url: string; // direct S3 URL
  width: number;
  height: number;
}

export interface PhotoData {
  id: string;
  filename: string;
  originalPath: string | null;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  blurhash?: string | null;
  orientation?: number;
  metadata?: string | null;
  thumbnails: ThumbnailData[];
}

export interface VideoData {
  id: string;
  filename: string;
  originalPath: string;
  s3Key: string;
  fileSize: number;
  takenAt: string | null;
  createdAt: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  metadata?: string | null;
  thumbnails: ThumbnailData[];
}

export type MediaItem = (PhotoData & { type: 'photo' }) | (VideoData & { type: 'video' });

export interface SubAlbumData {
  id: string;
  path: string;
  slugPath: string;
  name: string;
  description: string | null;
  photoCount: number;
  totalPhotoCount: number;
  subAlbumsCount: number;
  thumbnails: {
    mediaId: string;
    filename: string;
    mediaType: 'photo' | 'video';
    thumbnailUrl?: string;
  }[];
  dateRange?: {
    earliest: string | null;
    latest: string | null;
  } | null;
}

export interface BreadcrumbItem {
  name: string;
  href: string;
}

export interface PaginationData {
  page: number;
  limit: number;
  totalPhotos: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AlbumPageData {
  album: {
    id: string;
    path: string;
    slugPath: string;
    name: string;
    description: string | null;
    photoCount: number;
    totalPhotoCount: number;
    subAlbumsCount: number;
  };
  subAlbums: SubAlbumData[];
  photos: PhotoData[];
  videos: VideoData[];
  media: MediaItem[];
  pagination: PaginationData;
  breadcrumbs: BreadcrumbItem[];
}
