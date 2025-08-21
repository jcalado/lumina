import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
import { getPhotoOrientation } from '@/lib/photo-orientation';

export async function POST(request: NextRequest) {
  try {
    const { photoIds } = await request.json();

    if (!photoIds || !Array.isArray(photoIds)) {
      return NextResponse.json(
        { error: 'photoIds must be an array' },
        { status: 400 }
      );
    }

    if (photoIds.length === 0) {
      return NextResponse.json({ photos: [] });
    }

    // Get photos from database
    const photos = await prisma.photo.findMany({
      where: {
        id: { in: photoIds },
        album: {
          status: 'PUBLIC',
          enabled: true,
        },
      },
      include: {
        album: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
      },
      orderBy: {
        takenAt: 'desc',
      },
    });

    // Get signed URLs for all photos
    const photosWithUrls = await Promise.all(
      photos.map(async (photo: typeof photos[0]) => {
        const signedUrl = await s3.getSignedUrl(photo.s3Key, 3600); // 1 hour expiry
        return {
          ...photo,
          orientation: getPhotoOrientation(photo.metadata),
          url: signedUrl,
        };
      })
    );

    return NextResponse.json({ photos: photosWithUrls });
  } catch (error) {
    console.error('Error fetching photos batch:', error);
    return NextResponse.json(
      { error: 'Failed to fetch photos' },
      { status: 500 }
    );
  }
}
