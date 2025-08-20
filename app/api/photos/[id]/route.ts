import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const photoId = resolvedParams.id;
    
    // Get photo from database
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        album: true,
      },
    });

    if (!photo) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    // Check if album is accessible
    if (photo.album.status === 'PRIVATE' || !photo.album.enabled) {
      return NextResponse.json(
        { error: 'Photo not accessible' },
        { status: 403 }
      );
    }

    // Get signed URL for the photo
    const signedUrl = await s3.getSignedUrl(photo.s3Key, 3600); // 1 hour expiry

    return NextResponse.json({
      photo: {
        ...photo,
        url: signedUrl,
      },
    });
  } catch (error) {
    console.error('Error fetching photo:', error);
    return NextResponse.json(
      { error: 'Failed to fetch photo' },
      { status: 500 }
    );
  }
}
