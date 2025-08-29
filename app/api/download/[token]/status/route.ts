import { NextRequest, NextResponse } from 'next/server';
import { getJob, getZipPath } from '@/lib/download-jobs';
import fs from 'fs';

interface Params { token: string }

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { token } = await context.params;
    const job = getJob(token);
    if (job) {
      return NextResponse.json({
        token: job.token,
        status: job.status,
        total: job.total,
        processed: job.processed,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
        filename: job.filename,
        ready: job.status === 'COMPLETED',
        error: job.error || null,
        downloadUrl: job.status === 'COMPLETED' ? `/api/download/${job.token}/file` : null,
      });
    }

    // Fallback: check if the zip file exists on disk (e.g., different runtime)
    const filePath = getZipPath(token);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // Unknown job, set a temporary window
      return NextResponse.json({
        token,
        status: 'COMPLETED',
        total: 1,
        processed: 1,
        createdAt: new Date(stat.mtimeMs).toISOString(),
        expiresAt: expiresAt.toISOString(),
        filename: `${token}.zip`,
        ready: true,
        error: null,
        downloadUrl: `/api/download/${token}/file`,
      });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to get download status:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
