import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const submissions = await prisma.dropboxSubmission.findMany({
    where: { dropboxId: id },
    orderBy: { createdAt: 'desc' },
    include: { files: { orderBy: { createdAt: 'asc' } } },
  });

  const s3 = getS3Service();
  const withPreviews = await Promise.all(
    submissions.map(async (sub) => ({
      id: sub.id,
      uploaderName: sub.uploaderName,
      uploaderEmail: sub.uploaderEmail,
      message: sub.message,
      createdAt: sub.createdAt,
      reviewedAt: sub.reviewedAt,
      files: await Promise.all(
        sub.files.map(async (f) => ({
          id: f.id,
          filename: f.filename,
          kind: f.kind,
          status: f.status,
          previewUrl: f.status === 'PENDING' ? await s3.getSignedUrl(f.s3Key, 600) : null,
        }))
      ),
    }))
  );

  return NextResponse.json({ submissions: withPreviews });
}
