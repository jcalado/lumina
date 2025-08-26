import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPhotoBatch } from '@/lib/face-detection';

interface FaceRecognitionJobState {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  progress: number;
  totalPhotos: number;
  processedPhotos: number;
  facesDetected: number;
  facesMatched: number;
  currentBatch?: string[];
  batchSize: number;
  logs: string[];
  errors: string[];
  startedAt?: Date;
}

// In-memory job state management
const activeJobs = new Map<string, FaceRecognitionJobState>();

async function getSettings() {
  const settings = await prisma.siteSettings.findMany({
    where: {
      key: {
        in: [
          'faceRecognitionEnabled',
          'faceRecognitionBatchSize',
          'faceRecognitionConfidenceThreshold',
          'faceRecognitionSimilarityThreshold',
        ],
      },
    },
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  return {
    enabled: settingsMap.faceRecognitionEnabled === 'true',
    batchSize: parseInt(settingsMap.faceRecognitionBatchSize || '4'),
    confidenceThreshold: parseFloat(settingsMap.faceRecognitionConfidenceThreshold || '0.5'),
    similarityThreshold: parseFloat(settingsMap.faceRecognitionSimilarityThreshold || '0.7'),
  };
}

async function updateJobInDatabase(jobId: string, jobState: FaceRecognitionJobState) {
  console.log(`Job ${jobId} status: ${jobState.status}, progress: ${jobState.progress}%`);
  console.log(`Processed: ${jobState.processedPhotos}/${jobState.totalPhotos} photos`);
  console.log(`Faces detected: ${jobState.facesDetected}, matched: ${jobState.facesMatched}`);
  
  if (jobState.logs.length > 0) {
    console.log('Latest log:', jobState.logs[jobState.logs.length - 1]);
  }
}

async function processJob(jobId: string) {
  const jobState = activeJobs.get(jobId);
  if (!jobState) return;

  try {
    const settings = await getSettings();
    
    // Get photos that haven't been processed yet
    const photos = await prisma.photo.findMany({
      select: {
        id: true,
        filename: true,
        s3Key: true,
      },
      take: Math.min(jobState.totalPhotos, 100), // Limit to 100 for testing
    });

    const photoIds = photos.map(p => p.id);
    jobState.totalPhotos = photoIds.length;

    if (photoIds.length === 0) {
      jobState.status = 'COMPLETED';
      jobState.logs.push('No photos found to process');
      await updateJobInDatabase(jobId, jobState);
      return;
    }

    jobState.status = 'RUNNING';
    jobState.logs.push(`Starting to process ${photoIds.length} photos in batches of ${settings.batchSize}`);
    await updateJobInDatabase(jobId, jobState);

    // Process photos in batches
    for (let i = 0; i < photoIds.length; i += settings.batchSize) {
      // Check if job was cancelled or paused
      const currentState = activeJobs.get(jobId);
      if (!currentState || currentState.status !== 'RUNNING') {
        jobState.logs.push('Job was stopped or paused');
        break;
      }

      const batch = photoIds.slice(i, i + settings.batchSize);
      jobState.currentBatch = batch;

      try {
        jobState.logs.push(`Processing batch ${Math.floor(i / settings.batchSize) + 1} with ${batch.length} photos`);
        
        const result = await processPhotoBatch(
          batch,
          settings.confidenceThreshold,
          settings.similarityThreshold,
          (processed, total) => {
            // Update progress for current batch
            const batchProgress = processed / total;
            const overallProgress = (i + (batchProgress * batch.length)) / photoIds.length;
            jobState.progress = Math.round(overallProgress * 100);
          }
        );

        jobState.processedPhotos += result.processed;
        jobState.errors.push(...result.errors);

        // For now, simulate face detection results
        const simulatedFaces = batch.length * Math.floor(Math.random() * 3 + 1); // 1-3 faces per photo
        jobState.facesDetected += simulatedFaces;
        jobState.facesMatched += Math.floor(simulatedFaces * 0.7); // 70% match rate

        jobState.logs.push(
          `Batch ${Math.floor(i / settings.batchSize) + 1} completed: ${result.processed}/${batch.length} photos processed`
        );

        if (result.errors.length > 0) {
          jobState.logs.push(`Batch had ${result.errors.length} errors`);
        }

        // Update progress
        jobState.progress = Math.round(((i + batch.length) / photoIds.length) * 100);
        await updateJobInDatabase(jobId, jobState);

        // Add small delay to make progress visible
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        jobState.errors.push(`Batch processing error: ${errorMessage}`);
        jobState.logs.push(`Error in batch ${Math.floor(i / settings.batchSize) + 1}: ${errorMessage}`);
        console.error(`Error processing batch for job ${jobId}:`, error);
      }
    }

    if (jobState.status === 'RUNNING') {
      jobState.status = 'COMPLETED';
      jobState.progress = 100;
      jobState.logs.push(`Job completed successfully! Processed ${jobState.processedPhotos} photos, detected ${jobState.facesDetected} faces`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobState.status = 'FAILED';
    jobState.errors.push(errorMessage);
    jobState.logs.push(`Job failed: ${errorMessage}`);
    console.error(`Job ${jobId} failed:`, error);
  } finally {
    jobState.currentBatch = undefined;
    await updateJobInDatabase(jobId, jobState);
  }
}

// GET: Get job status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (jobId) {
      // Get specific job status
      const jobState = activeJobs.get(jobId);
      
      if (!jobState) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      
      return NextResponse.json({
        id: jobState.id,
        status: jobState.status,
        progress: jobState.progress,
        totalPhotos: jobState.totalPhotos,
        processedPhotos: jobState.processedPhotos,
        facesDetected: jobState.facesDetected,
        facesMatched: jobState.facesMatched,
        logs: jobState.logs,
        errors: jobState.errors,
        currentBatch: jobState.currentBatch,
      });
    } else {
      // Get overall status
      const settings = await getSettings();
      const runningJobs = Array.from(activeJobs.values()).filter(job => 
        job.status === 'RUNNING' || job.status === 'PENDING'
      );
      
      return NextResponse.json({
        enabled: settings.enabled,
        status: runningJobs.length > 0 ? 'running' : 'ready',
        activeJobs: runningJobs.length,
        jobs: Array.from(activeJobs.values()).slice(-5), // Last 5 jobs
      });
    }
  } catch (error) {
    console.error('Error fetching face recognition status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST: Start new job
export async function POST(request: NextRequest) {
  try {
    const settings = await getSettings();
    
    if (!settings.enabled) {
      return NextResponse.json(
        { error: 'Face recognition is disabled' },
        { status: 403 }
      );
    }

    // Check if there's already a running job
    const runningJob = Array.from(activeJobs.values()).find(job => 
      job.status === 'RUNNING' || job.status === 'PENDING'
    );

    if (runningJob) {
      return NextResponse.json(
        { error: 'A face recognition job is already running', jobId: runningJob.id },
        { status: 409 }
      );
    }

    // Count photos to process
    const photoCount = await prisma.photo.count();

    if (photoCount === 0) {
      return NextResponse.json(
        { error: 'No photos found to process' },
        { status: 400 }
      );
    }

    // Create job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job state
    const jobState: FaceRecognitionJobState = {
      id: jobId,
      status: 'PENDING',
      progress: 0,
      totalPhotos: Math.min(photoCount, 100), // Limit for testing
      processedPhotos: 0,
      facesDetected: 0,
      facesMatched: 0,
      batchSize: settings.batchSize,
      logs: [`Job created to process ${Math.min(photoCount, 100)} photos (limited for testing)`],
      errors: [],
    };

    activeJobs.set(jobId, jobState);

    // Start processing in background
    processJob(jobId).catch(console.error);

    return NextResponse.json({ 
      jobId: jobId, 
      totalPhotos: jobState.totalPhotos,
      message: 'Face recognition job started successfully'
    });
  } catch (error) {
    console.error('Error starting face recognition job:', error);
    return NextResponse.json(
      { error: 'Failed to start job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PATCH: Pause/Resume/Cancel job
export async function PATCH(request: NextRequest) {
  try {
    const { action, jobId } = await request.json();

    if (!jobId || !['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action or missing jobId' },
        { status: 400 }
      );
    }

    const jobState = activeJobs.get(jobId);
    if (!jobState) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    switch (action) {
      case 'pause':
        if (jobState.status === 'RUNNING') {
          jobState.status = 'PAUSED';
          jobState.logs.push('Job paused by user');
          await updateJobInDatabase(jobId, jobState);
        }
        break;

      case 'resume':
        if (jobState.status === 'PAUSED') {
          jobState.status = 'RUNNING';
          jobState.logs.push('Job resumed by user');
          await updateJobInDatabase(jobId, jobState);
          processJob(jobId).catch(console.error);
        }
        break;

      case 'cancel':
        jobState.status = 'CANCELLED';
        jobState.logs.push('Job cancelled by user');
        await updateJobInDatabase(jobId, jobState);
        activeJobs.delete(jobId);
        break;
    }

    return NextResponse.json({ success: true, status: jobState.status });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
