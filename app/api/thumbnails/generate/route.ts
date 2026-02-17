import { NextResponse } from 'next/server';
import { enqueueThumbnailJob, getThumbnailQueue } from '@/lib/queues/thumbnailQueue';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    console.log('Starting thumbnail generation for photos without thumbnails...');

    const photos = await prisma.photo.findMany({
      where: { thumbnails: { none: {} } },
      select: { id: true, filename: true, s3Key: true, album: { select: { path: true } } }
    })
    for (const p of photos) {
      await enqueueThumbnailJob({
        photoId: p.id,
        s3Key: p.s3Key,
        albumPath: p.album.path,
        filename: p.filename
      })
    }
    await getThumbnailQueue().resume()

    return NextResponse.json({
      success: true,
      message: `Enqueued ${photos.length} photos for thumbnail generation`,
      processed: 0,
      total: photos.length,
    });
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnails' },
      { status: 500 }
    );
  }
}
