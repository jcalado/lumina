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
    
    // Get photo details
    const photo = await prisma.photo.findUnique({
      where: { id },
      select: {
        filename: true,
        s3Key: true,
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Get signed URL for download
    const s3Service = new S3Service();
    const downloadUrl = await s3Service.getSignedUrl(photo.s3Key, 3600); // 1 hour expiry

    // Redirect to the signed URL
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error('Error serving photo download:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
