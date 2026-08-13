import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { token: string }

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { token } = await context.params;

    // Job state lives in the database rather than in this process's memory, so it does not
    // matter that the worker built the archive and a web container is answering here. The
    // previous implementation fell back to probing its own tmpfs and synthesising a
    // COMPLETED response with an invented expiry whenever the in-memory entry was missing.
    const job = await prisma.downloadJob.findUnique({ where: { token } });

    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ready = job.status === 'COMPLETED';

    return NextResponse.json({
      token: job.token,
      status: job.status,
      total: job.total,
      processed: job.processed,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      filename: job.filename,
      ready,
      error: job.error || null,
      downloadUrl: ready ? `/api/download/${job.token}/file` : null,
    });
  } catch (error) {
    console.error('Failed to get download status:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
