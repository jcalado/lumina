import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import archiver from 'archiver';

export async function POST(request: NextRequest) {
  try {
    const { albumPath } = await request.json();

    if (!albumPath) {
      return NextResponse.json({ error: 'Album path is required' }, { status: 400 });
    }

    console.log('Download request for album path:', albumPath);

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

    console.log('Found album:', album ? album.name : 'null');

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    if (album.photos.length === 0) {
      return NextResponse.json({ error: 'Album has no photos' }, { status: 400 });
    }

    console.log('Album has', album.photos.length, 'photos');

    const s3Service = new S3Service();

    // Create a ZIP archive
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

    // Create buffers to collect the archive data
    const chunks: Buffer[] = [];
    
    // Collect archive data
    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });

    // Handle archive completion
    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => {
        const result = Buffer.concat(chunks);
        console.log(`Archive created with size: ${result.length} bytes`);
        resolve(result);
      });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        reject(err);
      });

      // Add a timeout to prevent hanging
      setTimeout(() => {
        reject(new Error('Archive creation timeout'));
      }, 60000); // 60 second timeout
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
    console.log('Finalizing archive...');
    archive.finalize();

    // Wait for archive to complete
    const archiveBuffer = await archivePromise;
    console.log('Archive completed, returning response');

    return new NextResponse(new Uint8Array(archiveBuffer), { headers });

  } catch (error) {
    console.error('Error downloading album:', error);
    return NextResponse.json(
      { error: `Failed to download album: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
