import { NextResponse } from 'next/server';
import { generateMissingThumbnails } from '@/lib/thumbnails';

export async function POST() {
  try {
    console.log('Starting thumbnail generation for photos without thumbnails...');
    
    const result = await generateMissingThumbnails();

    return NextResponse.json({
      success: true,
      message: `Generated thumbnails for ${result.processed} out of ${result.total} photos`,
      processed: result.processed,
      total: result.total,
    });
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnails' },
      { status: 500 }
    );
  }
}
