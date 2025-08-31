import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueSyncJob } from '@/lib/queues/syncQueue';

export async function POST(request: NextRequest) {
  try {
    // Create a new sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        type: 'S3',
        status: 'PENDING',
        startedAt: new Date(),
      },
    });

    // Enqueue the sync job
    await enqueueSyncJob({
      jobId: syncJob.id,
      type: 'S3',
    });

    return NextResponse.json({
      jobId: syncJob.id,
      status: 'started',
    });
  } catch (error) {
    console.error('Error starting S3 rebuild:', error);
    return NextResponse.json(
      { error: 'Failed to start S3 rebuild' },
      { status: 500 }
    );
  }
}