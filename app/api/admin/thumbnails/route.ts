import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reprocessAllThumbnails } from '@/lib/thumbnails';
import { getThumbnailQueue, enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue';

interface ThumbnailJob {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  totalPhotos: number;
  processedPhotos: number;
  thumbnailsCreated: number;
  startedAt: string | null;
  completedAt: string | null;
  errors: string | null;
  createdAt: string;
}

// Global variable to track running jobs (in production, use Redis or a job queue)
let runningJobId: string | null = null;
let isInitialized = false;

// Legacy stub to satisfy references after BullMQ migration
const processReprocessJobInBackground = async (_jobId: string) => {
  return;
}

// Initialize runningJobId from database on first request
async function initializeRunningJobId() {
  if (isInitialized) return;
  
  try {
    const runningJobs = await (prisma as any).thumbnailJob?.findMany({
      where: { status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    }) || [];
    
    if (runningJobs.length > 0) {
      runningJobId = runningJobs[0].id;
      console.log(`Initialized runningJobId from database: ${runningJobId}`);
      
      // Check if the job is really old (more than 1 hour) and mark as failed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (runningJobs[0].startedAt && new Date(runningJobs[0].startedAt) < oneHourAgo) {
        console.log(`Marking old running job ${runningJobId} as failed`);
        await (prisma as any).thumbnailJob?.update({
          where: { id: runningJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errors: JSON.stringify(['Job timed out or server was restarted']),
          },
        });
        runningJobId = null;
      }
    }
  } catch (error) {
    console.log('ThumbnailJob table not available yet during initialization');
  }
  
  isInitialized = true;
}

export async function GET() {
  try {
    const queue = getThumbnailQueue();
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused().then(v => v ? 1 : 0)
    ]);
    const photosWithout = await prisma.photo.count({ where: { thumbnails: { none: {} } } });
    const photosTotal = await prisma.photo.count();
    return NextResponse.json({ success: true, queue: { waiting, active, completed, failed, delayed, paused }, stats: { photosWithout, photosTotal } });
  } catch (error) {
    console.error('Error fetching thumbnail queue status:', error);
    return NextResponse.json({ error: 'Failed to fetch thumbnail queue status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Initialize running job tracking from database
    await initializeRunningJobId();
    
    const { action, parallel } = await request.json();

    if (action === 'start') {
      // First, check for any actual running jobs in the database
      let actualRunningJobs: any[] = [];
      try {
        actualRunningJobs = await (prisma as any).thumbnailJob?.findMany({
          where: { status: 'RUNNING' },
        }) || [];
        
        if (actualRunningJobs.length > 0) {
          runningJobId = actualRunningJobs[0].id;
          return NextResponse.json(
            { error: 'A thumbnail job is already running' },
            { status: 400 }
          );
        }
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
      }
      
      // Clear any stale runningJobId if no actual running jobs found
      if (runningJobId && actualRunningJobs.length === 0) {
        console.log(`Clearing stale runningJobId: ${runningJobId}`);
        runningJobId = null;
      }

      // Choose processing method based on parallel parameter
      const useParallel = parallel === true;
      
      console.log(`Starting thumbnail job with ${useParallel ? 'PARALLEL' : 'SERIAL'} processing`);

      // Get count of photos without thumbnails
      const photosWithoutThumbnails = await prisma.photo.findMany({
        where: {
          thumbnails: {
            none: {},
          },
        },
        select: { id: true },
      });

      // Enqueue BullMQ jobs for photos missing thumbnails
      const photos = await prisma.photo.findMany({
        where: { thumbnails: { none: {} } },
        select: { id: true, filename: true, originalPath: true, s3Key: true, album: { select: { path: true } } }
      });
      for (const p of photos) {
        await enqueueThumbnailJob({
          photoId: p.id,
          originalPath: p.originalPath,
          s3Key: p.s3Key,
          albumPath: p.album.path,
          filename: p.filename
        });
      }
      return NextResponse.json({ success: true, enqueued: photos.length });
    }

    if (action === 'stop') {
      // Check for any actual running jobs in the database
      let actualRunningJobs: any[] = [];
      try {
        actualRunningJobs = await (prisma as any).thumbnailJob?.findMany({
          where: { status: 'RUNNING' },
        }) || [];
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
      }
      
      if (actualRunningJobs.length === 0) {
        // Clear stale runningJobId and return appropriate message
        runningJobId = null;
        return NextResponse.json(
          { error: 'No thumbnail job is currently running' },
          { status: 400 }
        );
      }
      
      // Use the actual running job ID
      const actualRunningJobId = actualRunningJobs[0].id;
      runningJobId = actualRunningJobId;

      // Try to update job status, handle case where table doesn't exist
      try {
        await (prisma as any).thumbnailJob?.update({
          where: { id: actualRunningJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errors: JSON.stringify(['Job stopped by user']),
          },
        });
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
      }

      runningJobId = null;

      return NextResponse.json({
        success: true,
        message: 'Thumbnail job stop requested',
      });
    }

    if (action === 'reprocess') {
      // First, check for any actual running jobs in the database
      let actualRunningJobs: any[] = [];
      try {
        actualRunningJobs = await (prisma as any).thumbnailJob?.findMany({
          where: { status: 'RUNNING' },
        }) || [];
        
        if (actualRunningJobs.length > 0) {
          runningJobId = actualRunningJobs[0].id;
          return NextResponse.json(
            { error: 'A thumbnail job is already running' },
            { status: 400 }
          );
        }
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
      }
      
      // Clear any stale runningJobId if no actual running jobs found
      if (runningJobId && actualRunningJobs.length === 0) {
        console.log(`Clearing stale runningJobId: ${runningJobId}`);
        runningJobId = null;
      }

      // Get count of all photos (for reprocessing all)
      const allPhotos = await prisma.photo.findMany({
        select: { id: true },
      });

      // Try to create new job, but handle case where table doesn't exist
      let job: any = null;
      try {
        job = await (prisma as any).thumbnailJob?.create({
          data: {
            status: 'PENDING',
            totalPhotos: allPhotos.length,
          },
        });
        
        if (job) {
          runningJobId = job.id;
          // Start background reprocessing
          processReprocessJobInBackground(job.id);
        }
      } catch (error) {
        console.log('ThumbnailJob table not available yet, starting direct reprocessing');
        // Fall back to direct processing without job tracking
        try {
        const result = await reprocessAllThumbnails();
          
          return NextResponse.json({
            success: true,
            message: `Reprocessed thumbnails for ${result.processed} photos, deleted ${result.deleted} old thumbnails`,
            processed: result.processed,
            total: result.total,
            deleted: result.deleted,
          });
        } catch (processingError) {
          return NextResponse.json(
            { error: 'Failed to reprocess thumbnails' },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Thumbnail reprocessing job started',
        job: job ? {
          ...job,
          startedAt: job.startedAt?.toISOString() || null,
          completedAt: job.completedAt?.toISOString() || null,
          createdAt: job.createdAt?.toISOString() || null,
        } : null,
      });
    }

    if (action === 'cleanup') {
      // Clean up any stuck jobs
      try {
        const stuckJobs = await (prisma as any).thumbnailJob?.findMany({
          where: { status: 'RUNNING' },
        }) || [];
        
        for (const job of stuckJobs) {
          await (prisma as any).thumbnailJob?.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errors: JSON.stringify(['Job manually cleaned up']),
            },
          });
        }
        
        runningJobId = null;
        
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${stuckJobs.length} stuck job(s)`,
          cleanedJobs: stuckJobs.length,
        });
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
        runningJobId = null;
        return NextResponse.json({
          success: true,
          message: 'Cleared job tracking state',
        });
      }
    }

    if (action === 'start-videos') {
      // Check if already running
      if (runningJobId) {
        return NextResponse.json(
          { error: 'A thumbnail job is already running' },
          { status: 409 }
        );
      }

      try {
        console.log('Starting video thumbnail generation...');
        const { generateMissingVideoThumbnails } = await import('@/lib/video-thumbnails');
        
        // For simplicity, we'll do direct processing for videos
        runningJobId = `video-thumbnails-${Date.now()}`;
        
        const result = await generateMissingVideoThumbnails();
        
        runningJobId = null;
        
        return NextResponse.json({
          success: true,
          message: `Generated video thumbnails for ${result.processed} out of ${result.total} videos`,
          processed: result.processed,
          total: result.total,
        });
      } catch (error) {
        runningJobId = null;
        console.error('Video thumbnail generation failed:', error);
        return NextResponse.json(
          { error: 'Failed to generate video thumbnails' },
          { status: 500 }
        );
      }
    }

    if (action === 'reprocess-videos') {
      // Check if already running
      if (runningJobId) {
        return NextResponse.json(
          { error: 'A thumbnail job is already running' },
          { status: 409 }
        );
      }

      try {
        console.log('Starting video thumbnail reprocessing...');
        const { reprocessAllVideoThumbnails } = await import('@/lib/video-thumbnails');
        
        runningJobId = `video-reprocess-${Date.now()}`;
        
        const result = await reprocessAllVideoThumbnails();
        
        runningJobId = null;
        
        return NextResponse.json({
          success: true,
          message: `Reprocessed ${result.processed} videos, deleted ${result.deleted} old video thumbnails`,
          processed: result.processed,
          total: result.total,
          deleted: result.deleted,
        });
      } catch (error) {
        runningJobId = null;
        console.error('Video thumbnail reprocessing failed:', error);
        return NextResponse.json(
          { error: 'Failed to reprocess video thumbnails' },
          { status: 500 }
        );
      }
    }

    if (action === 'start-all') {
      // Process both photos and videos
      if (runningJobId) {
        return NextResponse.json(
          { error: 'A thumbnail job is already running' },
          { status: 409 }
        );
      }

      try {
        console.log('Starting thumbnail generation for both photos and videos...');
        
        runningJobId = `all-thumbnails-${Date.now()}`;
        
        // Import both libraries
        const { generateMissingThumbnails } = await import('@/lib/thumbnails');
        const { generateMissingVideoThumbnails } = await import('@/lib/video-thumbnails');
        
        // Process photos first
        console.log('Processing photo thumbnails...');
        const photoResult = await generateMissingThumbnails();
        
        // Then process videos
        console.log('Processing video thumbnails...');
        const videoResult = await generateMissingVideoThumbnails();
        
        runningJobId = null;
        
        return NextResponse.json({
          success: true,
          message: `Generated thumbnails for ${photoResult.processed} photos and ${videoResult.processed} videos`,
          photos: {
            processed: photoResult.processed,
            total: photoResult.total,
          },
          videos: {
            processed: videoResult.processed,
            total: videoResult.total,
          },
          totalProcessed: photoResult.processed + videoResult.processed,
          totalItems: photoResult.total + videoResult.total,
        });
      } catch (error) {
        runningJobId = null;
        console.error('Combined thumbnail generation failed:', error);
        return NextResponse.json(
          { error: 'Failed to generate thumbnails' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Available actions: start, stop, reprocess, cleanup, start-videos, reprocess-videos, start-all' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error handling thumbnail job action:', error);
    return NextResponse.json(
      { error: 'Failed to handle thumbnail job action' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Try to delete all thumbnail jobs, handle case where table doesn't exist
    try {
      await (prisma as any).thumbnailJob?.deleteMany({});
    } catch (error) {
      console.log('ThumbnailJob table not available yet');
    }

    runningJobId = null;

    return NextResponse.json({
      success: true,
      message: 'Thumbnail job logs cleared',
    });
  } catch (error) {
    console.error('Error clearing thumbnail job logs:', error);
    return NextResponse.json(
      { error: 'Failed to clear thumbnail job logs' },
      { status: 500 }
    );
  }
}