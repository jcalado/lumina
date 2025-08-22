import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API endpoint to cancel a running sync job
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Get the current sync job
    const syncJob = await prisma.syncJob.findUnique({
      where: { id: jobId }
    });

    if (!syncJob) {
      return NextResponse.json(
        { error: 'Sync job not found' },
        { status: 404 }
      );
    }

    if (syncJob.status !== 'RUNNING') {
      return NextResponse.json(
        { error: 'Sync job is not running' },
        { status: 400 }
      );
    }

    // Update the sync job status to cancelled
    const updatedJob = await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED' as any, // Type assertion until Prisma client is updated
        completedAt: new Date(),
        progress: 100, // Mark as complete to stop any ongoing progress updates
        errors: JSON.stringify(['Sync cancelled by user'])
      }
    });

    // Note: In a real production system, you would also need to:
    // 1. Signal the background sync process to stop (using a shared state, Redis, or event system)
    // 2. Clean up any partial uploads or temporary files
    // 3. Potentially rollback any database changes if needed
    // 
    // For this implementation, we're just marking the job as cancelled in the database.
    // The sync process should check the job status periodically and stop if cancelled.

    return NextResponse.json({
      success: true,
      message: 'Sync job cancelled successfully',
      job: updatedJob
    });

  } catch (error) {
    console.error('Error cancelling sync job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel sync job', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * API endpoint to get the status of a specific sync job
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const syncJob = await prisma.syncJob.findUnique({
      where: { id: jobId }
    });

    if (!syncJob) {
      return NextResponse.json(
        { error: 'Sync job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: syncJob
    });

  } catch (error) {
    console.error('Error getting sync job status:', error);
    return NextResponse.json(
      { error: 'Failed to get sync job status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
