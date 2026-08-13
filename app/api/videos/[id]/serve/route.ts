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
    
    // Get video details
    const video = await prisma.video.findUnique({
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

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const s3Service = new S3Service();

    let s3Key: string;
    let isVideoThumbnail = false;
    let cacheControl: string;

    if (size === 'original') {
      s3Key = video.s3Key;
      cacheControl = IMMUTABLE_CACHE_CONTROL;
    } else {
      const resolved = resolveThumbnail(video.thumbnails, size);
      if (!resolved) {
        // No poster generated yet. Previously this buffered the entire video file into
        // memory and served it as video/mp4 into an <Image> tag; redirect to a presigned
        // URL instead so the bytes never pass through Node, with a short TTL so the real
        // poster is picked up once the worker generates it.
        const url = await s3Service.getSignedUrl(video.s3Key, 3600);
        return NextResponse.redirect(url, {
          headers: { 'Cache-Control': PROVISIONAL_CACHE_CONTROL },
        });
      }
      s3Key = resolved.s3Key;
      isVideoThumbnail = true;
      cacheControl = resolved.exact ? IMMUTABLE_CACHE_CONTROL : PROVISIONAL_CACHE_CONTROL;
    }
    
    try {
      // Get the video data from S3
      const videoBuffer = await s3Service.getObject(s3Key);
      
      // Determine content type based on whether this is a thumbnail or original video
      let contentType: string;
      
      if (isVideoThumbnail) {
        // Video thumbnails are always JPEG images
        contentType = 'image/jpeg';
      } else {
        // Determine video content type based on file extension
        const extension = s3Key.toLowerCase().split('.').pop();
        contentType = 'video/mp4'; // default
        
        if (extension === 'mov') {
          contentType = 'video/quicktime';
        } else if (extension === 'avi') {
          contentType = 'video/x-msvideo';
        } else if (extension === 'mkv') {
          contentType = 'video/x-matroska';
        } else if (extension === 'webm') {
          contentType = 'video/webm';
        } else if (extension === 'm4v') {
          contentType = 'video/x-m4v';
        } else if (extension === '3gp') {
          contentType = 'video/3gpp';
        } else if (extension === 'flv') {
          contentType = 'video/x-flv';
        } else if (extension === 'wmv') {
          contentType = 'video/x-ms-wmv';
        }
      }
      
      // Return the video data directly
      return new NextResponse(new Uint8Array(videoBuffer), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'Accept-Ranges': 'bytes', // Important for video seeking
        },
      });
    } catch (s3Error) {
      console.error('Error fetching video from S3:', s3Error);
      // Fallback to redirect if direct fetch fails
      const encodedS3Key = encodeURIComponent(s3Key).replace(/%2F/g, '/');
      const directUrl = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${encodedS3Key}`;
      return NextResponse.redirect(directUrl);
    }
  } catch (error) {
    console.error('Error serving video:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
