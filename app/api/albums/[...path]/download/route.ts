import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import archiver from 'archiver';
import { Readable } from 'stream';

interface Params {
  path: string[];
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { path } = await context.params;
    const albumPath = path.join('/');

    // Get album and its photos
    const album = await prisma.album.findFirst({
      where: { path: albumPath },
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

    // Create a readable stream for the response
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Set response headers for file download
    const albumName = album.name.replace(/[^a-zA-Z0-9\-_\s]/g, ''); // Sanitize filename
    const filename = `${albumName}-photos.zip`;
    
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    });

    // Create a transform stream to handle the archive
    const { readable, writable } = new TransformStream();
    
    // Start the download process in the background
    (async () => {
      try {
        const writer = writable.getWriter();
        
        // Setup archive events
        archive.on('error', (err) => {
          console.error('Archive error:', err);
          writer.close();
        });

        archive.on('end', () => {
          writer.close();
        });

        // Pipe archive data to the response stream
        archive.on('data', (chunk) => {
          writer.write(new Uint8Array(chunk));
        });

        // Add photos to the archive
        for (const photo of album.photos) {
          try {
            console.log(`Adding photo to archive: ${photo.filename}`);
            const imageBuffer = await s3Service.getObject(photo.s3Key);
            archive.append(imageBuffer, { name: photo.filename });
          } catch (photoError) {
            console.error(`Error adding photo ${photo.filename}:`, photoError);
            // Continue with other photos instead of failing the whole download
          }
        }

        // Finalize the archive
        archive.finalize();
      } catch (error) {
        console.error('Error creating archive:', error);
        const writer = writable.getWriter();
        writer.close();
      }
    })();

    return new NextResponse(readable, { headers });
  } catch (error) {
    console.error('Error downloading album:', error);
    return NextResponse.json(
      { error: 'Failed to download album' },
      { status: 500 }
    );
  }
}
