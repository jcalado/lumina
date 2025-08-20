import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMissingThumbnails } from '@/lib/thumbnails';

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

async function processJobInBackground(jobId: string) {
  try {
    console.log(`Starting thumbnail job ${jobId}`);

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

    for (const photo of photosWithoutThumbnails) {
      // Check if job was stopped
      if (runningJobId !== jobId) {
        console.log(`Job ${jobId} was stopped`);
        break;
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

        thumbnailsCreated += result.thumbnailsCreated;
        processedPhotos++;

        // Update progress
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

        console.log(`Processed ${processedPhotos}/${photosWithoutThumbnails.length} photos (${progress}%)`);

      } catch (error) {
        const errorMessage = `Failed to process ${photo.filename}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMessage);
        console.error(errorMessage);
        
        // Continue processing other photos
        processedPhotos++;
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
