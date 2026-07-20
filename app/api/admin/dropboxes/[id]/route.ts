import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { generateDropboxToken } from '@/lib/dropbox/token';
import { hashPassphrase } from '@/lib/dropbox/passphrase';
import { getS3Service } from '@/lib/s3';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await request.json();

  // Validates an optional positive integer field; returns a 400 response on bad input.
  const badInt = (v: unknown, opts: { allowNull?: boolean } = {}) =>
    !(v === undefined || (opts.allowNull && v === null) || (typeof v === 'number' && Number.isInteger(v) && v > 0));

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name;
  if ('destinationAlbumId' in body) data.destinationAlbumId = body.destinationAlbumId || null;
  if ('enabled' in body) data.enabled = !!body.enabled;
  if ('expiresAt' in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if ('maxUploads' in body) {
    if (badInt(body.maxUploads, { allowNull: true })) return NextResponse.json({ error: 'maxUploads must be a positive integer or null' }, { status: 400 });
    data.maxUploads = body.maxUploads ?? null;
  }
  if ('maxFilesPerSubmission' in body) {
    if (badInt(body.maxFilesPerSubmission)) return NextResponse.json({ error: 'maxFilesPerSubmission must be a positive integer' }, { status: 400 });
    data.maxFilesPerSubmission = body.maxFilesPerSubmission;
  }
  if ('maxFileSizeBytes' in body) {
    if (badInt(body.maxFileSizeBytes)) return NextResponse.json({ error: 'maxFileSizeBytes must be a positive integer' }, { status: 400 });
    data.maxFileSizeBytes = body.maxFileSizeBytes;
  }
  if ('allowVideos' in body) data.allowVideos = !!body.allowVideos;
  if (body.rotateToken === true) data.token = generateDropboxToken();
  if ('passphrase' in body) data.passphraseHash = body.passphrase ? await hashPassphrase(body.passphrase) : null;

  const updated = await prisma.dropbox.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id, token: updated.token, url: `/submit/${updated.token}` });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  // Purge staged S3 objects for all still-pending files before cascade delete.
  const files = await prisma.dropboxFile.findMany({
    where: { submission: { dropboxId: id }, status: 'PENDING' },
    select: { s3Key: true },
  });
  const s3 = getS3Service();
  await Promise.all(files.map((f) => s3.deleteObject(f.s3Key).catch(() => {})));

  await prisma.dropbox.delete({ where: { id } }); // cascades submissions + files
  return NextResponse.json({ ok: true });
}
