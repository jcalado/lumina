import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get photo thumbnail statistics from database
    const totalPhotos = await prisma.photo.count();
    const photosWithThumbnails = await prisma.photo.count({
      where: {
        thumbnails: {
          some: {},
        },
      },
    });
    
    const photosWithoutThumbnails = totalPhotos - photosWithThumbnails;
    const totalPhotoThumbnails = await prisma.thumbnail.count();
    
    // Get video thumbnail statistics from database
    let totalVideos = 0;
    let videosWithThumbnails = 0;
    let totalVideoThumbnails = 0;
    
    try {
      totalVideos = await (prisma as any).video?.count() || 0;
      videosWithThumbnails = await (prisma as any).video?.count({
        where: {
          thumbnails: {
            some: {},
          },
        },
      }) || 0;
      totalVideoThumbnails = await (prisma as any).videoThumbnail?.count() || 0;
    } catch (error) {
      console.log('Video models not available yet');
    }
    
    const videosWithoutThumbnails = totalVideos - videosWithThumbnails;
    
    // Combined statistics
    const totalMediaItems = totalPhotos + totalVideos;
    const totalMediaWithThumbnails = photosWithThumbnails + videosWithThumbnails;
    const totalMediaWithoutThumbnails = photosWithoutThumbnails + videosWithoutThumbnails;
    const totalThumbnails = totalPhotoThumbnails + totalVideoThumbnails;
    
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
        // Photo statistics
        totalPhotos,
        photosWithThumbnails,
        photosWithoutThumbnails,
        totalPhotoThumbnails,
        photoCompletionPercentage: totalPhotos > 0 ? Math.round((photosWithThumbnails / totalPhotos) * 100) : 100,
        
        // Video statistics
        totalVideos,
        videosWithThumbnails,
        videosWithoutThumbnails,
        totalVideoThumbnails,
        videoCompletionPercentage: totalVideos > 0 ? Math.round((videosWithThumbnails / totalVideos) * 100) : 100,
        
        // Combined statistics
        totalMediaItems,
        totalMediaWithThumbnails,
        totalMediaWithoutThumbnails,
        totalThumbnails,
        overallCompletionPercentage: totalMediaItems > 0 ? Math.round((totalMediaWithThumbnails / totalMediaItems) * 100) : 100,
        
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
