import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import sharp from 'sharp';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const faceId = params.id;

    const face = await prisma.face.findUnique({
      where: { id: faceId },
      include: {
        photo: {
          select: { s3Key: true, filename: true },
        },
      },
    });

    if (!face) {
      return new NextResponse('Face not found', { status: 404 });
    }

    if (!face.photo?.s3Key) {
      return new NextResponse('Photo S3 key not found for face', { status: 404 });
    }

    const s3Service = new S3Service();
    const imageBuffer = await s3Service.getObject(face.photo.s3Key);

    const boundingBox = JSON.parse(face.boundingBox);

    // Calculate zoom/padding
    const padding = 0.2; // 20% padding
    const originalImage = sharp(imageBuffer);
    const metadata = await originalImage.metadata();

    if (!metadata.width || !metadata.height) {
      return new NextResponse('Could not get image metadata', { status: 500 });
    }

    const cropX = Math.max(0, boundingBox.x - boundingBox.width * padding);
    const cropY = Math.max(0, boundingBox.y - boundingBox.height * padding);
    const cropWidth = Math.min(metadata.width - cropX, boundingBox.width * (1 + 2 * padding));
    const cropHeight = Math.min(metadata.height - cropY, boundingBox.height * (1 + 2 * padding));

    const croppedBuffer = await originalImage
      .extract({ left: Math.round(cropX), top: Math.round(cropY), width: Math.round(cropWidth), height: Math.round(cropHeight) })
      .resize(200, 200, { fit: 'cover' }) // Resize to a standard thumbnail size
      .jpeg({ quality: 85 })
      .toBuffer();

    return new NextResponse(croppedBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': croppedBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error serving face thumbnail:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
