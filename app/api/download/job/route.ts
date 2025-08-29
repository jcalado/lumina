import { NextRequest, NextResponse } from 'next/server';
import { createAlbumJob, createPhotosJob } from '@/lib/download-jobs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body?.type as 'album' | 'photos';
    if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });
    const token = crypto.randomUUID();

    if (type === 'album') {
      const albumPath = body?.albumPath as string;
      if (!albumPath) return NextResponse.json({ error: 'albumPath is required' }, { status: 400 });
      createAlbumJob(token, albumPath);
    } else if (type === 'photos') {
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

