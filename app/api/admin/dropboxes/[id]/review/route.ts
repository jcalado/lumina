import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { promoteDropboxFile, rejectDropboxFile, markSubmissionReviewedIfComplete } from '@/lib/dropbox/promote';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const { action, fileIds, destinationAlbumId, reason } = await request.json();

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json({ error: 'fileIds required' }, { status: 400 });
  }

  let albumId: string | null = destinationAlbumId ?? null;
  if (action === 'approve' && !albumId) {
    const dropbox = await prisma.dropbox.findUnique({ where: { id } });
    albumId = dropbox?.destinationAlbumId ?? null;
    if (!albumId) return NextResponse.json({ error: 'No destination album set — pick one to approve' }, { status: 400 });
  }

  const errors: Array<{ fileId: string; error: string }> = [];
  const submissionIds = new Set<string>();

  for (const fileId of fileIds as string[]) {
    const file = await prisma.dropboxFile.findFirst({
      where: { id: fileId, submission: { dropboxId: id }, status: 'PENDING' },
      select: { id: true, submissionId: true },
    });
    if (!file) { errors.push({ fileId, error: 'Not found or already reviewed' }); continue; }
    try {
      if (action === 'approve') await promoteDropboxFile(fileId, albumId!, session.user.id);
      else await rejectDropboxFile(fileId, session.user.id, reason);
      submissionIds.add(file.submissionId);
    } catch (e) {
      errors.push({ fileId, error: e instanceof Error ? e.message : 'Failed' });
    }
  }

  for (const sid of submissionIds) await markSubmissionReviewedIfComplete(sid);
  return NextResponse.json({ processed: fileIds.length - errors.length, errors });
}
