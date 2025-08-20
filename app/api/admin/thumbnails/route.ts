import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMissingThumbnails } from '@/lib/thumbnails';
import { getBatchProcessingSize } from '@/lib/settings';

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

export async function GET() {
  try {
    // Try to fetch jobs, but handle case where table doesn't exist yet
    let jobs = [];
    try {
      jobs = await (prisma as any).thumbnailJob?.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }) || [];
    } catch (error) {
      console.log('ThumbnailJob table not available yet, returning empty jobs array');
      jobs = [];
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
    const { action } = await request.json();

    if (action === 'start') {
      // Check if there's already a running job
      if (runningJobId) {
        let existingJob = null;
        try {
          existingJob = await (prisma as any).thumbnailJob?.findUnique({
            where: { id: runningJobId },
          });
        } catch (error) {
          console.log('ThumbnailJob table not available yet');
        }

        if (existingJob && existingJob.status === 'RUNNING') {
          return NextResponse.json(
            { error: 'A thumbnail job is already running' },
            { status: 400 }
          );
        } else {
          // Clear the stale job ID
          runningJobId = null;
        }
      }

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
      let job = null;
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
          processJobInBackground(job.id);
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
        message: 'Thumbnail job started',
        job: job ? {
          ...job,
          startedAt: job.startedAt?.toISOString() || null,
          completedAt: job.completedAt?.toISOString() || null,
          createdAt: job.createdAt?.toISOString() || null,
        } : null,
      });
    }

    if (action === 'stop') {
      if (!runningJobId) {
        return NextResponse.json(
          { error: 'No thumbnail job is currently running' },
          { status: 400 }
        );
      }

      // Try to update job status, handle case where table doesn't exist
      try {
        await (prisma as any).thumbnailJob?.update({
          where: { id: runningJobId },
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

    return NextResponse.json(
      { error: 'Invalid action' },
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
