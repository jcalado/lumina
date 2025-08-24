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

    let s3Key = video.s3Key; // Default to original video
    let isVideoThumbnail = false;

    // Try to find a thumbnail of the requested size
    if (size !== 'original') {
      const thumbnail = video.thumbnails.find((t: any) => t.size.toLowerCase() === size.toLowerCase());
      if (thumbnail) {
        s3Key = thumbnail.s3Key;
        isVideoThumbnail = true;
      }
    }

    // Get the video data directly from S3
    const s3Service = new S3Service();
    
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
          'Cache-Control': 'public, max-age=31536000, immutable',
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
