import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';

interface Params {
  id: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const size = searchParams.get('size') || 'small';
    
    // Get photo details
    const photo = await prisma.photo.findUnique({
      where: { id },
      select: {
        s3Key: true,
        filename: true,
        thumbnails: {
          select: {
            size: true,
            s3Key: true,
          },
        },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    let s3Key = photo.s3Key; // Default to original photo

    // Try to find a thumbnail of the requested size
    if (size !== 'original') {
      const thumbnail = photo.thumbnails.find((t: any) => t.size.toLowerCase() === size.toLowerCase());
      if (thumbnail) {
        s3Key = thumbnail.s3Key;
      }
    }

    // Get signed URL for the image
    const s3Service = new S3Service();
    
    // Since bucket is public, construct direct URL instead of signed URL
    const directUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${s3Key}`;

    // Redirect to the direct URL
    return NextResponse.redirect(directUrl);
  } catch (error) {
    console.error('Error serving photo:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
