import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getThumbnailQueue, enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue'

export async function GET() {
  try {
    const queue = getThumbnailQueue()
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused().then(v => (v ? 1 : 0)),
    ])
    const photosWithout = await prisma.photo.count({ where: { thumbnails: { none: {} } } })
    const photosTotal = await prisma.photo.count()
    return NextResponse.json({ success: true, queue: { waiting, active, completed, failed, delayed, paused }, stats: { photosWithout, photosTotal } })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch thumbnail queue status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    if (action === 'start') {
      const photos = await prisma.photo.findMany({
        where: { thumbnails: { none: {} } },
        select: { id: true, filename: true, s3Key: true, album: { select: { path: true } } },
      })
      for (const p of photos) {
        await enqueueThumbnailJob({
          photoId: p.id,
          s3Key: p.s3Key,
          albumPath: p.album.path,
          filename: p.filename,
        })
      }
      return NextResponse.json({ success: true, enqueued: photos.length })
    }

    if (action === 'stop') {
      await getThumbnailQueue().pause()
      return NextResponse.json({ success: true, message: 'Thumbnail queue paused' })
    }

    if (action === 'reprocess') {
      const all = await prisma.photo.findMany({
        select: { id: true, filename: true, s3Key: true, album: { select: { path: true } } },
      })
      for (const p of all) {
        await enqueueThumbnailJob({
          photoId: p.id,
          s3Key: p.s3Key,
          albumPath: p.album.path,
          filename: p.filename,
          reprocess: true,
        })
      }
      return NextResponse.json({ success: true, enqueued: all.length })
    }

    if (action === 'cleanup') {
      const queue = getThumbnailQueue()
      await queue.clean(0, 1000, 'completed')
      await queue.clean(0, 1000, 'failed')
      return NextResponse.json({ success: true, message: 'Cleaned completed/failed thumbnail jobs' })
    }

    return NextResponse.json({ error: 'Invalid action. Available: start, stop, reprocess, cleanup' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to handle thumbnail job action' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await getThumbnailQueue().obliterate({ force: true })
    return NextResponse.json({ success: true, message: 'Thumbnail queue cleared' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear thumbnail queue' }, { status: 500 })
  }
}
