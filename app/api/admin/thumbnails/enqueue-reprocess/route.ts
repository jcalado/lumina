import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { enqueueThumbnailJob, getThumbnailQueue } from '@/lib/queues/thumbnailQueue'

export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const photos = await prisma.photo.findMany({
      select: { id: true, filename: true, originalPath: true, s3Key: true, album: { select: { path: true } } }
    })
    for (const p of photos) {
      await enqueueThumbnailJob({
        photoId: p.id,
        originalPath: p.originalPath,
        s3Key: p.s3Key,
        albumPath: p.album.path,
        filename: p.filename,
        reprocess: true
      })
    }
    await getThumbnailQueue().resume()
    return NextResponse.json({ success: true, enqueued: photos.length })
  } catch (error) {
    console.error('Failed to enqueue reprocess:', error)
    return NextResponse.json({ error: 'Failed to enqueue reprocess' }, { status: 500 })
  }
}

