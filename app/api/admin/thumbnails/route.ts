import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMissingThumbnails, reprocessAllThumbnails } from '@/lib/thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';
import { processThumbnailJobParallel } from '@/scripts/thumbnail-parallel';

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
    // Initialize running job tracking from database
    await initializeRunningJobId();
    
    // Try to fetch jobs, but handle case where table doesn't exist yet
    let jobs: any[] = [];
    try {
      jobs = await (prisma as any).thumbnailJob?.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }) || [];
      
      // Sync the global runningJobId with actual database state
      if (runningJobId) {
        const runningJob = jobs.find((job: any) => job.id === runningJobId && job.status === 'RUNNING');
        if (!runningJob) {
          // No actual running job found, clear the stale ID
          console.log(`Clearing stale runningJobId: ${runningJobId}`);
          runningJobId = null;
        }
      } else {
        // Check if there's actually a running job we don't know about
        const actualRunningJob = jobs.find((job: any) => job.status === 'RUNNING');
        if (actualRunningJob) {
          runningJobId = actualRunningJob.id;
        }
      }
    } catch (error) {
      console.log('ThumbnailJob table not available yet, returning empty jobs array');
      jobs = [] as any[];
      // Clear runningJobId if table doesn't exist
      runningJobId = null;
    }

    return NextResponse.json({
      success: true,
      jobs: jobs.map((job: any) => ({
        ...job,
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        createdAt: job.createdAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching thumbnail jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch thumbnail jobs' },
      { status: 500 }
    );
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

      // Try to create new job, but handle case where table doesn't exist
      let job: any = null;
      try {
        job = await (prisma as any).thumbnailJob?.create({
          data: {
            status: 'PENDING',
            totalPhotos: photosWithoutThumbnails.length,
          },
        });
        
        if (job) {
          runningJobId = job.id;
          // Start background processing
          if (useParallel) {
            // Use parallel processing with worker threads
            setImmediate(() => {
              processThumbnailJobParallel(job.id);
            });
          } else {
            // Use original serial processing
            processJobInBackground(job.id);
          }
        }
      } catch (error) {
        console.log('ThumbnailJob table not available yet, starting direct processing');
        // Fall back to direct processing without job tracking
        try {
          const { generateMissingThumbnails } = await import('@/lib/thumbnails');
          const result = await generateMissingThumbnails();
          
          return NextResponse.json({
            success: true,
            message: `Generated thumbnails for ${result.processed} out of ${result.total} photos`,
            processed: result.processed,
            total: result.total,
          });
        } catch (processingError) {
          return NextResponse.json(
            { error: 'Failed to generate thumbnails' },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: `Thumbnail job started successfully (${useParallel ? 'parallel' : 'serial'} processing)`,
        processingMode: useParallel ? 'parallel' : 'serial',
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

async function processJobInBackground(jobId: string) {
  try {
    console.log(`Starting thumbnail job ${jobId}`);

    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Using batch processing size: ${batchSize}`);

    // Try to update job to running, handle case where table doesn't exist
    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
    } catch (error) {
      console.log('ThumbnailJob table not available yet');
    }

    // Get photos without thumbnails
    const photosWithoutThumbnails = await prisma.photo.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        metadata: true, // Include metadata for orientation extraction
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    let processedPhotos = 0;
    let thumbnailsCreated = 0;
    const errors: string[] = [];

    // Helper function to process a single photo
    const processSinglePhoto = async (photo: any) => {
      // Check if job was stopped
      if (runningJobId !== jobId) {
        console.log(`Job ${jobId} was stopped`);
        return { success: false, thumbnailsCreated: 0, stopped: true };
      }

      try {
        const { generateThumbnails } = await import('@/lib/thumbnails');
        
        // Extract orientation from photo metadata if available
        let orientation: number | undefined;
        if (photo.metadata) {
          try {
            const metadata = typeof photo.metadata === 'string' 
              ? JSON.parse(photo.metadata) 
              : photo.metadata;
            orientation = metadata.orientation;
          } catch (error) {
            console.log(`Could not parse metadata for ${photo.filename}`);
          }
        }
        
        const result = await generateThumbnails({
          photoId: photo.id,
          originalPath: photo.originalPath,
          s3Key: photo.s3Key,
          albumPath: photo.album.path,
          filename: photo.filename,
        });

        console.log(`Successfully processed: ${photo.filename} (${result.thumbnailsCreated} thumbnails)`);
        return { success: true, thumbnailsCreated: result.thumbnailsCreated, stopped: false };
      } catch (error) {
        const errorMessage = `Failed to process ${photo.filename}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
        return { success: false, thumbnailsCreated: 0, stopped: false };
      }
    };

    // Process photos in batches
    for (let i = 0; i < photosWithoutThumbnails.length; i += batchSize) {
      // Check if job was stopped
      if (runningJobId !== jobId) {
        console.log(`Job ${jobId} was stopped`);
        break;
      }

      const batch = photosWithoutThumbnails.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(photosWithoutThumbnails.length / batchSize)} (${batch.length} photos)`);

      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map(photo => processSinglePhoto(photo))
      );

      // Check if any processing was stopped
      const stoppedResult = batchResults.find(result => result.stopped);
      if (stoppedResult) {
        console.log(`Job ${jobId} was stopped during batch processing`);
        break;
      }

      // Update counters
      const batchProcessed = batchResults.length;
      const batchThumbnailsCreated = batchResults.reduce((sum, result) => sum + result.thumbnailsCreated, 0);
      
      processedPhotos += batchProcessed;
      thumbnailsCreated += batchThumbnailsCreated;

      // Update progress every batch
      const progress = Math.round((processedPhotos / photosWithoutThumbnails.length) * 100);
      
      try {
        await (prisma as any).thumbnailJob?.update({
          where: { id: jobId },
          data: {
            progress,
            processedPhotos,
            thumbnailsCreated,
          },
        });
      } catch (error) {
        console.log('ThumbnailJob table not available yet');
      }

      console.log(`Batch completed: ${processedPhotos}/${photosWithoutThumbnails.length} photos (${progress}%), ${thumbnailsCreated} thumbnails created`);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < photosWithoutThumbnails.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Complete job
    const finalStatus = errors.length > 0 && processedPhotos === 0 ? 'FAILED' : 'COMPLETED';
    
    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          progress: 100,
          processedPhotos,
          thumbnailsCreated,
          errors: errors.length > 0 ? JSON.stringify(errors) : null,
        },
      });
    } catch (error) {
      console.log('ThumbnailJob table not available yet');
    }

    runningJobId = null;
    console.log(`Thumbnail job ${jobId} completed: ${processedPhotos} photos processed, ${thumbnailsCreated} thumbnails created`);

  } catch (error) {
    console.error(`Thumbnail job ${jobId} failed:`, error);

    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: JSON.stringify([error instanceof Error ? error.message : String(error)]),
        },
      });
    } catch (updateError) {
      console.log('ThumbnailJob table not available yet');
    }

    runningJobId = null;
  }
}

async function processReprocessJobInBackground(jobId: string) {
  try {
    console.log(`Starting thumbnail reprocessing job ${jobId}`);

    // Try to update job to running, handle case where table doesn't exist
    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      });
    } catch (error) {
      console.log('ThumbnailJob table not available yet');
    }

    // Reprocess all thumbnails
    const result = await reprocessAllThumbnails();

    // Complete job
    const finalStatus = 'COMPLETED';
    
    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          progress: 100,
          processedPhotos: result.processed,
          thumbnailsCreated: result.processed * 3, // Each photo generates 3 thumbnails (small, medium, large)
          errors: null,
        },
      });
    } catch (error) {
      console.log('ThumbnailJob table not available yet');
    }

    runningJobId = null;
    console.log(`Thumbnail reprocessing job ${jobId} completed: ${result.processed} photos processed, ${result.deleted} old thumbnails deleted`);

  } catch (error) {
    console.error(`Thumbnail reprocessing job ${jobId} failed:`, error);

    try {
      await (prisma as any).thumbnailJob?.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: JSON.stringify([error instanceof Error ? error.message : String(error)]),
        },
      });
    } catch (updateError) {
      console.log('ThumbnailJob table not available yet');
    }

    runningJobId = null;
  }
}
