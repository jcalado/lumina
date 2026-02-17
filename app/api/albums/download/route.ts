import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import { slugPathToPath } from '@/lib/slug-paths';
import archiver from 'archiver';

export async function POST(request: NextRequest) {
  try {
    const { albumPath } = await request.json();

    if (!albumPath) {
      return NextResponse.json({ error: 'Album path is required' }, { status: 400 });
    }

    // Convert slug path to filesystem path
    const filesystemPath = await slugPathToPath(albumPath);
    if (filesystemPath === null) {
      return NextResponse.json({ error: 'Invalid album path' }, { status: 404 });
    }

    // Get album and its photos
    const album = await prisma.album.findFirst({
      where: { path: filesystemPath },
      include: {
        photos: {
          select: {
            id: true,
            filename: true,
            s3Key: true,
            fileSize: true,
          },
        },
      },
    });

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    if (album.photos.length === 0) {
      return NextResponse.json({ error: 'Album has no photos' }, { status: 400 });
    }

    const s3Service = new S3Service();

    // Set response headers for file download
    const albumName = album.name.replace(/[^a-zA-Z0-9\-_\s]/g, ''); // Sanitize filename
    const filename = `${albumName}-photos.zip`;

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

            for (let i = 0; i < album.photos.length; i += CONCURRENT_DOWNLOADS) {
              const batch = album.photos.slice(i, i + CONCURRENT_DOWNLOADS);

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
              if (i + CONCURRENT_DOWNLOADS < album.photos.length) {
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
      { error: `Failed to download album: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
