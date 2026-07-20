import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue';
import { enqueueBlurhashJob } from '@/lib/queues/blurhashQueue';
import { enqueueExifJob } from '@/lib/queues/exifQueue';
import { enqueueVideoThumbnailJob } from '@/lib/queues/videoThumbnailQueue';

export async function promoteDropboxFile(
  fileId: string,
  albumId: string,
  reviewerId: string
): Promise<{ photoId?: string; videoId?: string }> {
  const file = await prisma.dropboxFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('Dropbox file not found');
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw new Error('Destination album not found');

  const s3 = getS3Service();
  // Move staging object into the album's key namespace (dedupe on collision).
  let destKey = s3.generateKey(album.path, file.filename);
  if (await s3.objectExists(destKey)) {
    const dot = file.filename.lastIndexOf('.');
    const stem = dot === -1 ? file.filename : file.filename.slice(0, dot);
    const ext = dot === -1 ? '' : file.filename.slice(dot);
    destKey = s3.generateKey(album.path, `${stem}_${file.id.slice(0, 6)}${ext}`);
  }
  await s3.copyObject(file.s3Key, destKey);
  await s3.deleteObject(file.s3Key);

  if (file.kind === 'IMAGE') {
    const photo = await prisma.photo.create({
      data: { albumId, filename: file.filename, s3Key: destKey, fileSize: file.fileSize },
    });
    await enqueueThumbnailJob({ photoId: photo.id, s3Key: destKey, albumPath: album.path, filename: file.filename });
    await enqueueBlurhashJob({ photoId: photo.id, s3Key: destKey });
    await enqueueExifJob({ photoId: photo.id });
    await prisma.dropboxFile.update({
      where: { id: fileId },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), promotedPhotoId: photo.id },
    });
    return { photoId: photo.id };
  }

  const video = await prisma.video.create({
    data: { albumId, filename: file.filename, originalPath: destKey, s3Key: destKey, fileSize: file.fileSize },
  });
  await enqueueVideoThumbnailJob({ videoId: video.id, s3Key: destKey, albumPath: album.path, filename: file.filename });
  await prisma.dropboxFile.update({
    where: { id: fileId },
    data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), promotedVideoId: video.id },
  });
  return { videoId: video.id };
}

export async function rejectDropboxFile(fileId: string, reviewerId: string, reason?: string): Promise<void> {
  const file = await prisma.dropboxFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('Dropbox file not found');
  await getS3Service().deleteObject(file.s3Key).catch(() => {});
  await prisma.dropboxFile.update({
    where: { id: fileId },
    data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: reason ?? null },
  });
}

export async function markSubmissionReviewedIfComplete(submissionId: string): Promise<void> {
  const pending = await prisma.dropboxFile.count({ where: { submissionId, status: 'PENDING' } });
  if (pending === 0) {
    await prisma.dropboxSubmission.update({ where: { id: submissionId }, data: { reviewedAt: new Date() } });
  }
}
