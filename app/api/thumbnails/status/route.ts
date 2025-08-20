import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get thumbnail statistics from database
    const totalPhotos = await prisma.photo.count();
    const photosWithThumbnails = await prisma.photo.count({
      where: {
        thumbnails: {
          some: {},
        },
      },
    });
    
    const photosWithoutThumbnails = totalPhotos - photosWithThumbnails;
    const totalThumbnails = await prisma.thumbnail.count();
    
    // Get the last completed thumbnail job (once the database is updated)
    let lastCompletedJob = null;
    try {
      lastCompletedJob = await (prisma as any).thumbnailJob?.findFirst({
        where: {
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
      });
    } catch (error) {
      // thumbnailJob table doesn't exist yet, ignore
      console.log('ThumbnailJob table not available yet');
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        totalPhotos,
        photosWithThumbnails,
        photosWithoutThumbnails,
        totalThumbnails,
        completionPercentage: totalPhotos > 0 ? Math.round((photosWithThumbnails / totalPhotos) * 100) : 100,
        lastCompletedJob,
      },
    });
  } catch (error) {
    console.error('Error getting thumbnail status:', error);
    return NextResponse.json(
      { error: 'Failed to get thumbnail status' },
      { status: 500 }
    );
  }
}
