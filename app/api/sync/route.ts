import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueueSyncJob } from '@/lib/queues/syncQueue';

export async function POST(request: NextRequest) {
  try {
    let selectedPaths: string[] | null = null;
    let syncType: 'FILESYSTEM' | 'S3' = 'FILESYSTEM';
    
    try {
      const body = await request.json().catch(() => null);
      if (body) {
        if (Array.isArray(body.paths)) {
          selectedPaths = body.paths.filter((p: any) => typeof p === 'string');
        }
        if (body.type === 'S3') {
          syncType = 'S3';
        }
      }
    } catch {
      // ignore body parse errors; default to full sync
    }
    
    // Create a new sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        type: syncType,
        status: 'PENDING',
        startedAt: new Date(),
      },
    });

    // Enqueue the sync job
    await enqueueSyncJob({
      jobId: syncJob.id,
      type: syncType,
      selectedPaths: selectedPaths,
    });

    return NextResponse.json({
      jobId: syncJob.id,
      status: 'started',
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync' },
      { status: 500 }
    );
  }
}


