import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMissingVideoThumbnails, reprocessAllVideoThumbnails } from '@/lib/video-thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';
import { getVideoThumbnailQueue, enqueueVideoThumbnailJob } from '@/lib/queues/videoThumbnailQueue';

export async function GET() {
  try {
    const queue = getVideoThumbnailQueue()
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused().then(v => (v ? 1 : 0)),
    ])
    
    // Get batch size
    const batchSize = await getBatchProcessingSize()
    
    // Check for videos without thumbnails
    const videosWithoutThumbnails = await prisma.video.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      select: {
        id: true,
      },
    })

    return NextResponse.json({
      success: true,
      videosWithoutThumbnails: videosWithoutThumbnails.length,
      batchSize,
      queue: { waiting, active, completed, failed, delayed, paused },
    })
  } catch (error) {
    console.error('Error getting video thumbnail status:', error)
    return NextResponse.json(
      { error: 'Failed to get video thumbnail status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    if (action === 'start') {
      const videos = await prisma.video.findMany({
        where: { thumbnails: { none: {} } },
        include: { album: { select: { path: true } } },
      })
      
      for (const video of videos) {
        await enqueueVideoThumbnailJob({
          videoId: video.id,
          originalPath: video.originalPath,
          s3Key: video.s3Key,
          albumPath: video.album.path,
          filename: video.filename,
        })
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Video thumbnail processing started for ${videos.length} videos`,
        enqueued: videos.length 
      })
    }

    if (action === 'stop') {
      await getVideoThumbnailQueue().pause()
      return NextResponse.json({ success: true, message: 'Video thumbnail queue paused' })
    }

    if (action === 'reprocess') {
      const videos = await prisma.video.findMany({
        include: { album: { select: { path: true } } },
      })
      
      for (const video of videos) {
        await enqueueVideoThumbnailJob({
          videoId: video.id,
          originalPath: video.originalPath,
          s3Key: video.s3Key,
          albumPath: video.album.path,
          filename: video.filename,
          reprocess: true,
        })
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Video thumbnail reprocessing started for ${videos.length} videos`,
        enqueued: videos.length 
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in video thumbnail job management:', error)
    return NextResponse.json(
      { error: 'Failed to manage video thumbnail job' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    // Stop the queue
    await getVideoThumbnailQueue().pause()
    return NextResponse.json({
      success: true,
      message: 'Video thumbnail queue paused',
    })
  } catch (error) {
    console.error('Error stopping video thumbnail jobs:', error)
    return NextResponse.json(
      { error: 'Failed to stop video thumbnail jobs' },
      { status: 500 }
    )
  }
}


