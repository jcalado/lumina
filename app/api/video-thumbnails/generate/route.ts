import { NextResponse } from 'next/server';
import { generateMissingVideoThumbnails } from '@/lib/video-thumbnails';

export async function POST() {
  try {
    console.log('Starting video thumbnail generation...');
    
    const result = await generateMissingVideoThumbnails();

    return NextResponse.json({
      success: true,
      message: `Generated thumbnails for ${result.processed} out of ${result.total} videos`,
      processed: result.processed,
      total: result.total,
    });
  } catch (error) {
    console.error('Error generating video thumbnails:', error);
    return NextResponse.json(
      { error: 'Failed to generate video thumbnails' },
      { status: 500 }
    );
  }
}
