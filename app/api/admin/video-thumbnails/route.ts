import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMissingVideoThumbnails, reprocessAllVideoThumbnails } from '@/lib/video-thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';

interface VideoThumbnailJob {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  totalVideos: number;
  processedVideos: number;
  thumbnailsCreated: number;
  startedAt?: Date;
  completedAt?: Date;
  errors?: string;
}

// Global variable to track running jobs (in production, use Redis or a job queue)
let runningJobId: string | null = null;
let isInitialized = false;

// Initialize runningJobId from database on first request
async function initializeRunningJobId() {
  if (!isInitialized) {
    try {
      // Check for any running thumbnail jobs in the database
      const runningJob = await prisma.thumbnailJob.findFirst({
        where: { status: 'RUNNING' },
        orderBy: { createdAt: 'desc' },
      });
      
      if (runningJob) {
        runningJobId = runningJob.id;
        console.log(`Found existing running video thumbnail job: ${runningJobId}`);
      }
    } catch (error) {
      console.error('Failed to initialize running job ID:', error);
    }
    isInitialized = true;
  }
}

export async function GET() {
  try {
    await initializeRunningJobId();
    
    // Get current batch size
    const batchSize = await getBatchProcessingSize();
    
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
    });

    // Get the latest video thumbnail job
    const latestJob = await prisma.thumbnailJob.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      videosWithoutThumbnails: videosWithoutThumbnails.length,
      batchSize,
      runningJobId,
      latestJob: latestJob ? {
        ...latestJob,
        startedAt: latestJob.startedAt?.toISOString() || null,
        completedAt: latestJob.completedAt?.toISOString() || null,
        createdAt: latestJob.createdAt?.toISOString() || null,
      } : null,
    });
  } catch (error) {
    console.error('Error getting video thumbnail status:', error);
    return NextResponse.json(
      { error: 'Failed to get video thumbnail status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await initializeRunningJobId();
    
    const { action } = await request.json();

    if (action === 'generate') {
      // Check if a job is already running
      if (runningJobId) {
        const runningJob = await prisma.thumbnailJob.findUnique({
          where: { id: runningJobId },
        });
        
        if (runningJob && runningJob.status === 'RUNNING') {
          return NextResponse.json({
            success: false,
            message: 'A video thumbnail job is already running',
            job: runningJob,
          });
        } else {
          // Job is not actually running, clear the ID
          runningJobId = null;
        }
      }

      // Count videos without thumbnails
      const videosWithoutThumbnails = await prisma.video.findMany({
        where: {
          thumbnails: {
            none: {},
          },
        },
        select: {
          id: true,
        },
      });

      if (videosWithoutThumbnails.length === 0) {
        // Handle case with no missing thumbnails
        try {
          const { generateMissingVideoThumbnails } = await import('@/lib/video-thumbnails');
          const result = await generateMissingVideoThumbnails();
          
          return NextResponse.json({
            success: true,
            message: `Generated video thumbnails for ${result.processed} out of ${result.total} videos`,
            processed: result.processed,
            total: result.total,
          });
        } catch (processingError) {
          return NextResponse.json(
            { error: 'Failed to generate video thumbnails' },
            { status: 500 }
          );
        }
      }

      // Create new job
      const job = await prisma.thumbnailJob.create({
        data: {
          status: 'RUNNING',
          totalPhotos: videosWithoutThumbnails.length, // Reusing photo field name for simplicity
          startedAt: new Date(),
        },
      });

      runningJobId = job.id;

      // Start processing in background
      processVideoJobInBackground(job.id);

      return NextResponse.json({
        success: true,
        message: 'Video thumbnail job started',
        job: job ? {
          ...job,
          startedAt: job.startedAt?.toISOString() || null,
          completedAt: job.completedAt?.toISOString() || null,
          createdAt: job.createdAt?.toISOString() || null,
        } : null,
      });
    }

    if (action === 'stop') {
      // Check for any actual running jobs in the database
      const runningJob = await prisma.thumbnailJob.findFirst({
        where: { 
          status: 'RUNNING',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (runningJob) {
        // Mark job as cancelled
        await prisma.thumbnailJob.update({
          where: { id: runningJob.id },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
          },
        });
        
        runningJobId = null;
        
        return NextResponse.json({
          success: true,
          message: 'Video thumbnail job stopped',
        });
      } else {
        // No running job found
        runningJobId = null;
        return NextResponse.json({
          success: false,
          message: 'No running video thumbnail job found',
        });
      }
    }

    if (action === 'reprocess') {
      // Check if a job is already running
      if (runningJobId) {
        const runningJob = await prisma.thumbnailJob.findUnique({
          where: { id: runningJobId },
        });
        
        if (runningJob && runningJob.status === 'RUNNING') {
          return NextResponse.json({
            success: false,
            message: 'A video thumbnail job is already running',
            job: runningJob,
          });
        } else {
          // Job is not actually running, clear the ID
          runningJobId = null;
        }
      }

      // Count all videos
      const allVideos = await prisma.video.findMany({
        select: {
          id: true,
        },
      });

      // Create new reprocess job
      const job = await prisma.thumbnailJob.create({
        data: {
          status: 'RUNNING',
          totalPhotos: allVideos.length, // Reusing photo field name for simplicity
          startedAt: new Date(),
        },
      });

      runningJobId = job.id;

      // Start reprocessing in background
      processVideoReprocessJobInBackground(job.id);

      return NextResponse.json({
        success: true,
        message: 'Video thumbnail reprocess job started',
        job: {
          ...job,
          startedAt: job.startedAt?.toISOString() || null,
          completedAt: job.completedAt?.toISOString() || null,
          createdAt: job.createdAt?.toISOString() || null,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in video thumbnail job management:', error);
    return NextResponse.json(
      { error: 'Failed to manage video thumbnail job' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Stop any running jobs
    runningJobId = null;
    
    // Mark all running jobs as cancelled
    await prisma.thumbnailJob.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'All video thumbnail jobs stopped',
    });
  } catch (error) {
    console.error('Error stopping video thumbnail jobs:', error);
    return NextResponse.json(
      { error: 'Failed to stop video thumbnail jobs' },
      { status: 500 }
    );
  }
}

async function processVideoJobInBackground(jobId: string) {
  try {
    console.log(`Starting video thumbnail job: ${jobId}`);
    
    // Get all videos without thumbnails
    const videosWithoutThumbnails = await prisma.video.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      include: {
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    let processedVideos = 0;
    let thumbnailsCreated = 0;
    const errors: string[] = [];

    // Helper function to process a single video
    const processSingleVideo = async (video: any) => {
      // Check if job was stopped
      if (runningJobId !== jobId) {
        console.log(`Video job ${jobId} was stopped`);
        return { success: false, thumbnailsCreated: 0, stopped: true };
      }

      try {
        const { generateVideoThumbnails } = await import('@/lib/video-thumbnails');
        
        const result = await generateVideoThumbnails({
          videoId: video.id,
          originalPath: video.originalPath,
          s3Key: video.s3Key,
          albumPath: video.album.path,
          filename: video.filename,
        });

        console.log(`Successfully processed: ${video.filename} (${result.thumbnailsCreated} thumbnails)`);
        return { success: true, thumbnailsCreated: result.thumbnailsCreated, stopped: false };
      } catch (error) {
        const errorMessage = `Failed to process ${video.filename}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
        return { success: false, thumbnailsCreated: 0, stopped: false };
      }
    };

    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Processing videos in batches of ${batchSize}`);

    // Process videos in batches
    for (let i = 0; i < videosWithoutThumbnails.length; i += batchSize) {
      // Check if job was stopped
      if (runningJobId !== jobId) {
        console.log(`Video job ${jobId} was stopped`);
        break;
      }

      const batch = videosWithoutThumbnails.slice(i, i + batchSize);
      console.log(`Processing video batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosWithoutThumbnails.length / batchSize)} (${batch.length} videos)`);

      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map(video => processSingleVideo(video))
      );

      // Check if any processing was stopped
      const stoppedResult = batchResults.find(result => result.stopped);
      if (stoppedResult) {
        console.log(`Video job ${jobId} was stopped during batch processing`);
        break;
      }

      // Update counters
      const batchProcessed = batchResults.length;
      const batchThumbnailsCreated = batchResults.reduce((sum, result) => sum + result.thumbnailsCreated, 0);
      
      processedVideos += batchProcessed;
      thumbnailsCreated += batchThumbnailsCreated;

      // Update progress every batch
      const progress = Math.round((processedVideos / videosWithoutThumbnails.length) * 100);
      
      await prisma.thumbnailJob.update({
        where: { id: jobId },
        data: {
          progress,
          processedPhotos: processedVideos, // Reusing photo field name
          thumbnailsCreated,
        },
      });

      console.log(`Video batch completed: ${processedVideos}/${videosWithoutThumbnails.length} videos processed (${progress}%)`);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < videosWithoutThumbnails.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Job completed
    const finalStatus = runningJobId === jobId ? 'COMPLETED' : 'CANCELLED';
    
    await prisma.thumbnailJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        progress: finalStatus === 'COMPLETED' ? 100 : Math.round((processedVideos / videosWithoutThumbnails.length) * 100),
        processedPhotos: processedVideos, // Reusing photo field name
        thumbnailsCreated,
        completedAt: new Date(),
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    if (runningJobId === jobId) {
      runningJobId = null;
    }

    console.log(`Video thumbnail job ${jobId} ${finalStatus.toLowerCase()}: ${processedVideos} videos processed, ${thumbnailsCreated} thumbnails created`);
    
  } catch (error) {
    console.error(`Video thumbnail job ${jobId} failed:`, error);
    
    await prisma.thumbnailJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify([error instanceof Error ? error.message : String(error)]),
      },
    });

    if (runningJobId === jobId) {
      runningJobId = null;
    }
  }
}

async function processVideoReprocessJobInBackground(jobId: string) {
  try {
    console.log(`Starting video thumbnail reprocess job: ${jobId}`);
    
    const { reprocessAllVideoThumbnails } = await import('@/lib/video-thumbnails');
    const result = await reprocessAllVideoThumbnails();

    // Job completed
    await prisma.thumbnailJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        processedPhotos: result.processed, // Reusing photo field name
        thumbnailsCreated: result.processed * 3, // Estimate 3 thumbnails per video
        completedAt: new Date(),
      },
    });

    if (runningJobId === jobId) {
      runningJobId = null;
    }

    console.log(`Video thumbnail reprocess job ${jobId} completed: ${result.processed} videos processed, ${result.deleted} old thumbnails deleted`);
    
  } catch (error) {
    console.error(`Video thumbnail reprocess job ${jobId} failed:`, error);
    
    await prisma.thumbnailJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify([error instanceof Error ? error.message : String(error)]),
      },
    });

    if (runningJobId === jobId) {
      runningJobId = null;
    }
  }
}
