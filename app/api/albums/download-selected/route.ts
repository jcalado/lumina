import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import archiver from 'archiver';

export async function POST(request: NextRequest) {
  try {
    const { photoIds, albumPath } = await request.json();

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json({ error: 'Photo IDs are required' }, { status: 400 });
    }

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
        album: {
          select: {
            name: true,
          },
        },
      },
    });

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
            controller.close();
          });

          // Handle archive errors
          archive.on('error', (err) => {
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
                  const imageBuffer = await s3Service.getObject(photo.s3Key);
                  return { photo, imageBuffer };
                } catch (photoError) {
                  return null;
                }
              });

              const results = await Promise.allSettled(downloadPromises);

              // Add successfully downloaded photos to archive immediately
              for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                  const { photo, imageBuffer } = result.value;
                  processedCount++;
                  archive.append(imageBuffer, { name: photo.filename });
                }
              }

              // Small delay to prevent overwhelming the system
              if (i + CONCURRENT_DOWNLOADS < photos.length) {
                await new Promise(resolve => setImmediate(resolve));
              }
            }

            archive.finalize();
          };

          // Start processing photos immediately
          processPhotos().catch((error) => {
            controller.error(error);
          });

        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new NextResponse(stream, { headers });

  } catch (error) {
    return NextResponse.json(
      { error: `Failed to download selected photos: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
