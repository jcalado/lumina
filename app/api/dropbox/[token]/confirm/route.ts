import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { tryReserveCap } from '@/lib/dropbox/cap';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    return await confirm(request, await params);
  } catch (e) {
    // Keep the response JSON; an empty 500 body reads as a parse error client-side.
    console.error('[dropbox/confirm] unhandled error:', e);
    return NextResponse.json({ error: 'Upload could not be finalized' }, { status: 500 });
  }
}

async function confirm(request: NextRequest, { token }: { token: string }) {
  const dropbox = await prisma.dropbox.findUnique({ where: { token } });
  if (!dropbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { submissionId } = await request.json();
  const files = await prisma.dropboxFile.findMany({
    where: { submissionId, submission: { dropboxId: dropbox.id }, status: 'PENDING' },
  });

  const s3 = getS3Service();
  const rejected: string[] = [];
  const validFileIds: string[] = [];

  for (const file of files) {
    try {
      const meta = await s3.getObjectMetadata(file.s3Key);
      const sizeOk = meta.size > 0 && meta.size <= dropbox.maxFileSizeBytes;
      if (!sizeOk) {
        await s3.deleteObject(file.s3Key).catch(() => {});
        await prisma.dropboxFile.delete({ where: { id: file.id } });
        rejected.push(file.filename);
        continue;
      }
      validFileIds.push(file.id);
    } catch {
      // object never actually uploaded — drop the row
      await prisma.dropboxFile.delete({ where: { id: file.id } });
      rejected.push(file.filename);
    }
  }

  // Reserve cap for the accepted files (atomic); if the drop filled up, clean overflow.
  if (validFileIds.length > 0) {
    const reserved = await tryReserveCap(dropbox.id, validFileIds.length);
    if (!reserved) {
      const overflow = await prisma.dropboxFile.findMany({ where: { id: { in: validFileIds } } });
      await Promise.all(overflow.map((f) => s3.deleteObject(f.s3Key).catch(() => {})));
      await prisma.dropboxFile.deleteMany({ where: { id: { in: validFileIds } } });
      return NextResponse.json({ error: 'This dropbox filled up before your upload completed' }, { status: 409 });
    }
  }

  return NextResponse.json({ accepted: validFileIds.length, rejected });
}
