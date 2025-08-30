import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBlurhashQueue, enqueueBlurhashJob } from '@/lib/queues/blurhashQueue';

export async function GET() {
  try {
    const queue = getBlurhashQueue();
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused().then(v => (v ? 1 : 0)),
    ]);
    const photosWithout = await prisma.photo.count({ where: { blurhash: null } });
    return NextResponse.json({ success: true, queue: { waiting, active, completed, failed, delayed, paused }, stats: { photosWithout } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch blurhash status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    if (action === 'start') {
      const photos = await prisma.photo.findMany({
        where: { blurhash: null },
        select: { id: true, originalPath: true, s3Key: true, filename: true },
      });
      for (const p of photos) {
        await enqueueBlurhashJob({ photoId: p.id, originalPath: p.originalPath, s3Key: p.s3Key, filename: p.filename });
      }
      await getBlurhashQueue().resume()
      return NextResponse.json({ success: true, enqueued: photos.length });
    }
    if (action === 'stop') {
      await getBlurhashQueue().pause()
      return NextResponse.json({ success: true, message: 'Blurhash queue paused' })
    }
    if (action === 'cleanup') {
      const q = getBlurhashQueue()
      await q.clean(0, 1000, 'completed')
      await q.clean(0, 1000, 'failed')
      return NextResponse.json({ success: true, message: 'Cleaned completed/failed blurhash jobs' })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to manage blurhash queue' }, { status: 500 })
  }
}
