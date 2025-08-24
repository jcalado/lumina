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
    
    // Get video details
    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        s3Key: true,
        filename: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Get the video data directly from S3
    const s3Service = new S3Service();
    
    try {
      // Get the video data from S3
      const videoBuffer = await s3Service.getObject(video.s3Key);
      
      // Determine content type based on file extension
      const extension = video.s3Key.toLowerCase().split('.').pop();
      let contentType = 'video/mp4'; // default
      
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
      
      // Return the video data with download headers
      return new NextResponse(new Uint8Array(videoBuffer), {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${video.filename}"`,
          'Cache-Control': 'no-cache',
        },
      });
    } catch (s3Error) {
      console.error('Error fetching video from S3:', s3Error);
      return NextResponse.json(
        { error: 'Video not available' },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('Error downloading video:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
