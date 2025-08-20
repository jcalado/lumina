import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startBlurhashJob, requestJobStop } from '@/scripts/blurhash-worker';

export async function GET() {
  try {
    const jobs = await prisma.blurhashJob.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error fetching blurhash jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blurhash jobs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'start') {
      // Check if there's already a running job
      const runningJob = await prisma.blurhashJob.findFirst({
        where: {
          status: 'RUNNING',
        },
      });

      if (runningJob) {
        return NextResponse.json(
          { error: 'A blurhash job is already running' },
          { status: 400 }
        );
      }

      // Start the job in the background
      setImmediate(() => {
        startBlurhashJob();
      });

      return NextResponse.json({ 
        message: 'Blurhash job started successfully' 
      });
    }

    if (action === 'stop') {
      // Check if there's a running job
      const runningJob = await prisma.blurhashJob.findFirst({
        where: {
          status: 'RUNNING',
        },
      });

      if (!runningJob) {
        return NextResponse.json(
          { error: 'No blurhash job is currently running' },
          { status: 400 }
        );
      }

      // Request the job to stop
      requestJobStop();

      // Immediately update the job status to indicate stop was requested
      await prisma.blurhashJob.update({
        where: { id: runningJob.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: JSON.stringify(['Job stopped by user request']),
        },
      });

      return NextResponse.json({ 
        message: 'Blurhash job stopped successfully' 
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error managing blurhash job:', error);
    return NextResponse.json(
      { error: 'Failed to manage blurhash job' },
      { status: 500 }
    );
  }
}
