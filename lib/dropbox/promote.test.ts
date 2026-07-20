import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma');
vi.mock('@/lib/s3');
vi.mock('@/lib/queues/thumbnailQueue');
vi.mock('@/lib/queues/blurhashQueue');
vi.mock('@/lib/queues/exifQueue');
vi.mock('@/lib/queues/videoThumbnailQueue');

import { promoteDropboxFile } from './promote';
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue';
import { enqueueBlurhashJob } from '@/lib/queues/blurhashQueue';
import { enqueueExifJob } from '@/lib/queues/exifQueue';
import { enqueueVideoThumbnailJob } from '@/lib/queues/videoThumbnailQueue';

const mockPhoto = { create: vi.fn(async () => ({ id: 'photo1' })) };
const mockVideo = { create: vi.fn(async () => ({ id: 'video1' })) };
const mockDropboxFile = {
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
};
const mockAlbum = { findUnique: vi.fn(async () => ({ id: 'alb1', path: 'events/wedding' })) };
const copyObject = vi.fn(async () => {});
const deleteObject = vi.fn(async () => {});
const mockThumbnailJob = vi.fn(async () => {});
const mockBlurhashJob = vi.fn(async () => {});
const mockExifJob = vi.fn(async () => {});
const mockVideoThumbnailJob = vi.fn(async () => {});

vi.mocked(prisma).photo = mockPhoto as any;
vi.mocked(prisma).video = mockVideo as any;
vi.mocked(prisma).dropboxFile = mockDropboxFile as any;
vi.mocked(prisma).album = mockAlbum as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPhoto.create.mockResolvedValue({ id: 'photo1' } as any);
  mockVideo.create.mockResolvedValue({ id: 'video1' } as any);
  mockDropboxFile.findUnique.mockResolvedValue(null);
  mockDropboxFile.update.mockResolvedValue({} as any);
  mockAlbum.findUnique.mockResolvedValue({ id: 'alb1', path: 'events/wedding' } as any);

  const objectExists = vi.fn(async () => false);
  const s3Service = { copyObject, deleteObject, generateKey: (p: string, f: string) => `photos/${p}/${f}`, objectExists };
  vi.mocked(getS3Service).mockReturnValue(s3Service as any);

  vi.mocked(enqueueThumbnailJob).mockImplementation(mockThumbnailJob as any);
  vi.mocked(enqueueBlurhashJob).mockImplementation(mockBlurhashJob as any);
  vi.mocked(enqueueExifJob).mockImplementation(mockExifJob as any);
  vi.mocked(enqueueVideoThumbnailJob).mockImplementation(mockVideoThumbnailJob as any);
});

describe('promoteDropboxFile', () => {
  it('promotes an IMAGE to a Photo and enqueues photo jobs', async () => {
    mockDropboxFile.findUnique.mockResolvedValue({ id: 'f1', kind: 'IMAGE', filename: 'a.jpg', s3Key: '_dropbox/d/s/u_a.jpg', fileSize: 10 });
    const res = await promoteDropboxFile('f1', 'alb1', 'admin1');
    expect(res.photoId).toBe('photo1');
    expect(mockPhoto.create).toHaveBeenCalled();
    expect(enqueueThumbnailJob).toHaveBeenCalled();
    expect(enqueueBlurhashJob).toHaveBeenCalled();
    expect(enqueueExifJob).toHaveBeenCalled();
    expect(enqueueVideoThumbnailJob).not.toHaveBeenCalled();
    expect(copyObject).toHaveBeenCalledWith('_dropbox/d/s/u_a.jpg', 'photos/events/wedding/a.jpg');
    expect(deleteObject).toHaveBeenCalledWith('_dropbox/d/s/u_a.jpg');
  });

  it('promotes a VIDEO to a Video and enqueues the video-thumbnail job', async () => {
    mockDropboxFile.findUnique.mockResolvedValue({ id: 'f2', kind: 'VIDEO', filename: 'a.mov', s3Key: '_dropbox/d/s/u_a.mov', fileSize: 10 });
    const res = await promoteDropboxFile('f2', 'alb1', 'admin1');
    expect(res.videoId).toBe('video1');
    expect(mockVideo.create).toHaveBeenCalled();
    expect(enqueueVideoThumbnailJob).toHaveBeenCalled();
    expect(enqueueThumbnailJob).not.toHaveBeenCalled();
  });
});
