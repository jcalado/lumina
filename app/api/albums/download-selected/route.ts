import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import archiver from 'archiver';
import fs from 'fs/promises';
import path from 'path';

// Helper function to read photo data, preferring local files over S3
async function readPhotoData(photo: { filename: string; s3Key: string; originalPath: string | null }, s3Service: S3Service): Promise<Buffer> {
  // Try to read from local filesystem first
  if (photo.originalPath) {
    try {
      const photosRoot = process.env.PHOTOS_ROOT_PATH;
      let fullPath: string;
      
      // Check if originalPath is already absolute
      if (path.isAbsolute(photo.originalPath)) {
        fullPath = photo.originalPath;
      } else if (photosRoot) {
        fullPath = path.join(photosRoot, photo.originalPath);
      } else {
        // No PHOTOS_ROOT_PATH configured, fall back to S3
        console.log(`No PHOTOS_ROOT_PATH configured for ${photo.filename}, using S3`);
        return await s3Service.getObject(photo.s3Key);
      }
      
      // Check if file exists and read it
      await fs.access(fullPath);
      const buffer = await fs.readFile(fullPath);
      console.log(`✅ Read local file: ${photo.filename} (${buffer.length} bytes)`);
      return buffer;
      
    } catch (localError) {
      console.log(`❌ Local file not available for ${photo.filename}: ${localError instanceof Error ? localError.message : 'Unknown error'}`);
      console.log(`🔄 Falling back to S3 for ${photo.filename}`);
    }
  }
  
  // Fall back to S3 if local file is not available
  console.log(`📥 Reading from S3: ${photo.filename}`);
  return await s3Service.getObject(photo.s3Key);
}

export async function POST(request: NextRequest) {
  try {
    const { photoIds, albumPath } = await request.json();

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ error: 'Photo IDs are required' }, { status: 400 });
    }

    console.log('Download request for selected photos:', photoIds.length, 'photos');

    // Get selected photos from database
    const photos = await prisma.photo.findMany({
      where: {
        id: {
          in: photoIds,
        },
      },
      select: {
        id: true,
        filename: true,
        s3Key: true,
        originalPath: true,
        album: {
          select: {
            name: true,
          },
        },
      },
    });

    console.log('Found photos:', photos.length);

    if (photos.length === 0) {
      return NextResponse.json({ error: 'No photos found' }, { status: 404 });
    }

    const s3Service = new S3Service();

    // Set response headers for file download
    const albumName = photos[0]?.album?.name || 'Selected Photos';
    const sanitizedAlbumName = albumName.replace(/[^a-zA-Z0-9\-_\s]/g, '');
    const filename = `${sanitizedAlbumName}-selected-photos.zip`;
    
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    });

    // Create a ReadableStream to stream the ZIP archive
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Create a ZIP archive
          const archive = archiver('zip', {
            zlib: { level: 0 }, // No compression for better streaming performance
            statConcurrency: 1, // Process one file at a time to maintain order
            highWaterMark: 1024 * 16, // Smaller buffer for faster initial response
          });

          // Force the archive to start producing headers immediately
          archive.pointer(); // This forces internal initialization

          // Handle archive data - stream chunks directly to the browser
          archive.on('data', (chunk) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          // Handle archive completion
          archive.on('end', () => {
            console.log('Selected photos archive streaming completed');
            controller.close();
          });

          // Handle archive errors
          archive.on('error', (err) => {
            console.error('Archive error:', err);
            controller.error(err);
          });

          // Start downloading and adding photos immediately
          let processedCount = 0;
          
          const processPhotos = async () => {
            // Process photos with limited concurrency to avoid memory issues
            const CONCURRENT_DOWNLOADS = 2;
            
            for (let i = 0; i < photos.length; i += CONCURRENT_DOWNLOADS) {
              const batch = photos.slice(i, i + CONCURRENT_DOWNLOADS);
              
              // Download batch concurrently
              const downloadPromises = batch.map(async (photo) => {
                try {
                  console.log(`Processing photo: ${photo.filename}`);
                  const imageBuffer = await readPhotoData(photo, s3Service);
                  return { photo, imageBuffer };
                } catch (photoError) {
                  console.error(`Error processing photo ${photo.filename}:`, photoError);
                  return null;
                }
              });

              const results = await Promise.allSettled(downloadPromises);
              
              // Add successfully downloaded photos to archive immediately
              for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                  const { photo, imageBuffer } = result.value;
                  console.log(`Adding photo to archive: ${photo.filename} (${++processedCount}/${photos.length})`);
                  archive.append(imageBuffer, { name: photo.filename });
                }
              }
              
              // Small delay to prevent overwhelming the system
              if (i + CONCURRENT_DOWNLOADS < photos.length) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }
            
            console.log('All selected photos processed, finalizing archive...');
            archive.finalize();
          };

          // Start processing photos immediately
          processPhotos().catch((error) => {
            console.error('Error processing selected photos:', error);
            controller.error(error);
          });

        } catch (error) {
          console.error('Error setting up selected photos archive stream:', error);
          controller.error(error);
        }
      }
    });

    return new NextResponse(stream, { headers });

  } catch (error) {
    console.error('Error downloading selected photos:', error);
    return NextResponse.json(
      { error: `Failed to download selected photos: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
