import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { generateDropboxToken } from '@/lib/dropbox/token';
import { hashPassphrase } from '@/lib/dropbox/passphrase';

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const dropboxes = await prisma.dropbox.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      destinationAlbum: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  const withPending = await Promise.all(
    dropboxes.map(async (d) => ({
      ...d,
      passphraseHash: undefined,
      hasPassphrase: !!d.passphraseHash,
      pendingCount: await prisma.dropboxFile.count({
        where: { submission: { dropboxId: d.id }, status: 'PENDING' },
      }),
    }))
  );

  return NextResponse.json({ dropboxes: withPending });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  const {
    name, destinationAlbumId, expiresAt, passphrase,
    maxUploads, maxFilesPerSubmission, maxFileSizeBytes, allowVideos,
  } = body ?? {};

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const dropbox = await prisma.dropbox.create({
    data: {
      name,
      token: generateDropboxToken(),
      destinationAlbumId: destinationAlbumId || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      passphraseHash: passphrase ? await hashPassphrase(passphrase) : null,
      maxUploads: maxUploads ?? null,
      maxFilesPerSubmission: maxFilesPerSubmission ?? 50,
      maxFileSizeBytes: maxFileSizeBytes ?? 52428800,
      allowVideos: allowVideos ?? true,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({
    id: dropbox.id,
    token: dropbox.token,
    url: `/submit/${dropbox.token}`,
  });
}
