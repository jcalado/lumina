import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get total photo count
    const totalPhotos = await prisma.photo.count();
    
    // Get photos with blurhash
    const photosWithBlurhash = await prisma.photo.count({
      where: {
        blurhash: {
          not: null,
        },
      },
    });

    // Calculate photos without blurhash
    const photosWithoutBlurhash = totalPhotos - photosWithBlurhash;

    // Get the last completed blurhash job
    const lastCompletedJob = await prisma.blurhashJob.findFirst({
      where: {
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    const stats = {
      totalPhotos,
      photosWithBlurhash,
      photosWithoutBlurhash,
      lastCompletedJob,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching job statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job statistics' },
      { status: 500 }
    );
  }
}
