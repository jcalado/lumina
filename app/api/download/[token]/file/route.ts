import { NextRequest, NextResponse } from 'next/server';
import { getJob, getZipPath } from '@/lib/download-jobs';
import fs from 'fs';

interface Params { token: string }

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { token } = await context.params;
    const job = getJob(token);
    // Fallback to disk file if job is not available in memory
    const filePath = job?.filePath || getZipPath(token);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // If we have job, enforce expiry; otherwise allow (dev) download
    if (job && job.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Expired' }, { status: 410 });
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    return new NextResponse(stream as any, {
      headers: new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${(job && job.filename) || `${token}.zip`}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      }),
    });
  } catch (error) {
    console.error('Failed to serve download file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
