import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { getZipPath } from '@/lib/download-zip';

interface Params { token: string }

export async function GET(request: NextRequest, context: { params: Promise<Params> }) {
  try {
    const { token } = await context.params;

    const job = await prisma.downloadJob.findUnique({ where: { token } });
    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Expiry is now enforced unconditionally. Previously it was skipped whenever the job
    // was missing from the in-process Map, which was the common case after a restart or
    // from a second container — so expired archives stayed downloadable indefinitely.
    if (job.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Expired' }, { status: 410 });
    }

    if (job.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Not ready' }, { status: 409 });
    }

    const filePath = job.filePath || getZipPath(token);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    return new NextResponse(stream as any, {
      headers: new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${job.filename || `${token}.zip`}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      }),
    });
  } catch (error) {
    console.error('Failed to serve download file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
