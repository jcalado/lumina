import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  id: string;
}

// GET: Get faces in a photo
export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: photoId } = await context.params;

    // Check if face recognition is enabled
    const faceRecognitionSetting = await prisma.siteSettings.findUnique({
      where: { key: 'faceRecognitionPublicEnabled' },
    });

    if (!faceRecognitionSetting || faceRecognitionSetting.value !== 'true') {
      return NextResponse.json(
        { error: 'Face recognition is disabled' },
        { status: 403 }
      );
    }

    // Get photo with faces
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        thumbnails: true,
        album: {
          select: {
            status: true,
            enabled: true,
          },
        },
      },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    if (photo.album.status !== 'PUBLIC' || !photo.album.enabled) {
      return NextResponse.json({ error: 'Photo not accessible' }, { status: 403 });
    }

    // Get faces - we'll implement this once the Face model is working
    const faces: any[] = [];
    
    try {
      // This will work once we fix the Prisma client
      // const faces = await prisma.face.findMany({
      //   where: { photoId },
      //   include: {
      //     person: true,
      //   },
      // });
    } catch (error) {
      console.log('Face query not available yet');
    }

    // Get photo dimensions for coordinate scaling
    const largeThumbnail = photo.thumbnails.find(t => t.size === 'LARGE');
    const originalDimensions = { width: 0, height: 0 };
    
    if (largeThumbnail) {
      originalDimensions.width = largeThumbnail.width;
      originalDimensions.height = largeThumbnail.height;
    }

    return NextResponse.json({
      photoId: photo.id,
      faces: faces.map((face: any) => ({
        id: face.id,
        boundingBox: JSON.parse(face.boundingBox),
        confidence: face.confidence,
        person: face.person ? {
          id: face.person.id,
          name: face.person.name,
          confirmed: face.person.confirmed,
        } : null,
      })),
      originalDimensions,
    });
  } catch (error) {
    console.error('Error fetching photo faces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch photo faces' },
      { status: 500 }
    );
  }
}
