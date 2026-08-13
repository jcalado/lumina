import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { slugPathToPath } from '@/lib/slug-paths';
import { enqueueDownloadJob } from '@/lib/queues/downloadQueue';
import { getZipPath } from '@/lib/download-zip';

const JOB_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Reuses an existing build for the same content instead of starting another one.
 *
 * Every click used to mint a fresh UUID, so an impatient user could kick off several
 * full rebuilds of the same album concurrently.
 */
async function findReusableJob(dedupeKey: string): Promise<string | null> {
  const existing = await prisma.downloadJob.findFirst({
    where: {
      dedupeKey,
      status: { in: ['PENDING', 'RUNNING', 'COMPLETED'] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!existing) return null;

  // A COMPLETED row whose file has been swept is not reusable.
  if (existing.status === 'COMPLETED') {
    const filePath = existing.filePath || getZipPath(existing.token);
    if (!fs.existsSync(filePath)) return null;
  }

  return existing.token;
}

async function createJob(params: {
  dedupeKey: string;
  type: 'album' | 'photos';
  albumPath?: string;
  photoIds?: string[];
}): Promise<string> {
  const token = crypto.randomUUID();

  await prisma.downloadJob.create({
    data: {
      token,
      dedupeKey: params.dedupeKey,
      type: params.type,
      albumPath: params.albumPath ?? null,
      photoIds: params.photoIds ? JSON.stringify(params.photoIds) : null,
      status: 'PENDING',
      total: params.photoIds?.length ?? 0,
      expiresAt: new Date(Date.now() + JOB_TTL_MS),
    },
  });

  // jobId guards against two requests racing past the lookup above.
  await enqueueDownloadJob({ token }, { jobId: `download:${params.dedupeKey}` });

  return token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body?.type as 'album' | 'photos';
    if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

    if (type === 'album') {
      const albumPath = body?.albumPath as string;
      if (!albumPath) return NextResponse.json({ error: 'albumPath is required' }, { status: 400 });

      // The album API already refuses to serve PRIVATE or disabled albums
      // (app/api/albums/[...path]/route.ts). This endpoint accepted any path with no
      // check at all, so an album the gallery will not show was still zippable by
      // anyone who knew its path. Mirror that rule here rather than requiring a session,
      // since album downloads are a public-gallery feature.
      const resolvedPath = (await slugPathToPath(albumPath)) ?? albumPath;
      const album = await prisma.album.findFirst({
        where: { path: resolvedPath },
        select: { id: true, status: true, enabled: true, updatedAt: true },
      });

      if (!album) {
        return NextResponse.json({ error: 'Album not found' }, { status: 404 });
      }
      if (album.status === 'PRIVATE' || !album.enabled) {
        return NextResponse.json({ error: 'Album not accessible' }, { status: 403 });
      }

      // updatedAt is part of the key so edits to the album produce a fresh archive.
      const dedupeKey = `album:${album.id}:${album.updatedAt.toISOString()}`;
      const token = (await findReusableJob(dedupeKey)) ?? (await createJob({
        dedupeKey,
        type: 'album',
        albumPath,
      }));

      return NextResponse.json({ token, url: `/download/${token}` });
    }

    // Only the admin photo manager posts this shape
    // (app/admin/albums/[id]/photos/page.tsx). It intentionally allows photos from
    // private albums, so it is gated on an admin session rather than album status.
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const photoIds = body?.photoIds as string[];
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ error: 'photoIds is required' }, { status: 400 });
    }

    const sorted = [...photoIds].sort();
    const dedupeKey = `photos:${crypto.createHash('sha256').update(sorted.join(',')).digest('hex')}`;
    const token = (await findReusableJob(dedupeKey)) ?? (await createJob({
      dedupeKey,
      type: 'photos',
      photoIds: sorted,
    }));

    return NextResponse.json({ token, url: `/download/${token}` });
  } catch (error) {
    console.error('Failed to create download job:', error);
    return NextResponse.json({ error: 'Failed to create download job' }, { status: 500 });
  }
}
