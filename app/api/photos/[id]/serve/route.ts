import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import {
  resolveThumbnail,
  IMMUTABLE_CACHE_CONTROL,
  PROVISIONAL_CACHE_CONTROL,
} from '@/lib/thumbnail-resolution';

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

    const s3Service = new S3Service();

    let s3Key: string;
    let cacheControl: string;

    if (size === 'original') {
      s3Key = photo.s3Key;
      cacheControl = IMMUTABLE_CACHE_CONTROL;
    } else {
      const resolved = resolveThumbnail(photo.thumbnails, size);
      if (!resolved) {
        // No thumbnails exist yet (pre-generation, or the worker is behind). Redirect to
        // a presigned URL rather than buffering a multi-MB original through Node, and
        // keep the TTL short so clients pick up the real thumbnail once it lands.
        const url = await s3Service.getSignedUrl(photo.s3Key, 3600);
        return NextResponse.redirect(url, {
          headers: { 'Cache-Control': PROVISIONAL_CACHE_CONTROL },
        });
      }
      s3Key = resolved.s3Key;
      // Only cache long-term when the bytes are the size that was actually requested;
      // a substituted size must not be pinned for a year.
      cacheControl = resolved.exact ? IMMUTABLE_CACHE_CONTROL : PROVISIONAL_CACHE_CONTROL;
    }
    
    try {
      // Get the image data from S3
      const imageBuffer = await s3Service.getObject(s3Key);
      
      // Determine content type based on file extension
      const extension = s3Key.toLowerCase().split('.').pop();
      let contentType = 'image/jpeg'; // default
      
      if (extension === 'png') {
        contentType = 'image/png';
      } else if (extension === 'gif') {
        contentType = 'image/gif';
      } else if (extension === 'webp') {
        contentType = 'image/webp';
      }
      
      // Return the image data directly
      return new NextResponse(new Uint8Array(imageBuffer), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        },
      });
    } catch (s3Error) {
      console.error('Error fetching from S3:', s3Error);
      // Fallback to redirect if direct fetch fails
      const encodedS3Key = encodeURIComponent(s3Key).replace(/%2F/g, '/');
      const directUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${encodedS3Key}`;
      return NextResponse.redirect(directUrl);
    }
  } catch (error) {
    console.error('Error serving photo:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
