import { NextRequest, NextResponse } from 'next/server';
import { createAlbumJob, createPhotosJob } from '@/lib/download-jobs';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { slugPathToPath } from '@/lib/slug-paths';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body?.type as 'album' | 'photos';
    if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });
    const token = crypto.randomUUID();

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
        select: { status: true, enabled: true },
      });

      if (!album) {
        return NextResponse.json({ error: 'Album not found' }, { status: 404 });
      }
      if (album.status === 'PRIVATE' || !album.enabled) {
        return NextResponse.json({ error: 'Album not accessible' }, { status: 403 });
      }

      createAlbumJob(token, albumPath);
    } else if (type === 'photos') {
      // Only the admin photo manager posts this shape
      // (app/admin/albums/[id]/photos/page.tsx). It intentionally allows photos from
      // private albums, so it is gated on an admin session rather than album status.
      const auth = await requireAdmin();
      if (auth instanceof NextResponse) return auth;

      const photoIds = body?.photoIds as string[];
      if (!Array.isArray(photoIds) || photoIds.length === 0) return NextResponse.json({ error: 'photoIds is required' }, { status: 400 });
      createPhotosJob(token, photoIds);
    }

    return NextResponse.json({ token, url: `/download/${token}` });
  } catch (error) {
    console.error('Failed to create download job:', error);
    return NextResponse.json({ error: 'Failed to create download job' }, { status: 500 });
  }
}
