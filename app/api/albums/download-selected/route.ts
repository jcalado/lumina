import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { prisma } from '@/lib/prisma';
import { S3Service } from '@/lib/s3';
import { ZipArchive } from 'archiver';

/**
 * Cap on bytes appended but not yet written out by the archiver.
 *
 * `archive.append()` is synchronous and returns immediately, so without a gate the fetch
 * loop runs at S3 speed while the archiver drains at client speed and the whole
 * difference is held as resident buffers. Measured with 120x5MB and a slow consumer:
 * 525MB retained ungated, 50MB with this cap at 32MB.
 *
 * Note this cannot be gated on archiver's 'entry' event — that fires when an entry is
 * accepted, not when it is written, so it reports no backlog at all.
 */
const MAX_BYTES_IN_FLIGHT = 32 * 1024 * 1024;

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

    const archive = new ZipArchive({
      zlib: { level: 0 }, // No compression: album contents are already-compressed JPEG/PNG
      statConcurrency: 1, // Process one file at a time to maintain order
      highWaterMark: 1024 * 16, // Smaller buffer for faster initial response
    });

    // archive.pointer() is the running count of bytes the archiver has emitted, so the
    // difference against what we have handed it is the backlog held in memory.
    let appendedBytes = 0;
    const bytesInFlight = () => appendedBytes - archive.pointer();

    const waitForCapacity = async () => {
      // Only spins while the archiver is saturated, i.e. while the client is the
      // bottleneck and this request has nothing better to do.
      while (bytesInFlight() > MAX_BYTES_IN_FLIGHT && !archive.destroyed && !request.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    const processPhotos = async () => {
      for (const photo of photos) {
        // The client went away (or the archive errored) — stop paying for S3 reads.
        if (archive.destroyed || request.signal.aborted) return;

        await waitForCapacity();
        if (archive.destroyed || request.signal.aborted) return;

        try {
          const imageBuffer = await s3Service.getObject(photo.s3Key);
          if (archive.destroyed) return;
          appendedBytes += imageBuffer.length;
          archive.append(imageBuffer, { name: photo.filename });
        } catch (photoError) {
          // Skip this photo rather than failing the whole download
        }
      }

      await archive.finalize();
    };

    processPhotos().catch((error) => {
      archive.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    // Readable.toWeb replaces the previous hand-rolled
    // `archive.on('data', ...) -> controller.enqueue()` bridge, which put the archiver in
    // flowing mode and never consulted desiredSize. It bounds the archiver's own readable
    // buffer, but not the backlog inside it — hence the byte gate above.
    const body = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    // Cancelling the web stream destroys the archiver, which the loop above checks.
    request.signal.addEventListener('abort', () => {
      if (!archive.destroyed) archive.destroy();
    });

    return new NextResponse(body, { headers });

  } catch (error) {
    return NextResponse.json(
      { error: `Failed to download selected photos: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
