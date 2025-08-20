import { NextRequest, NextResponse } from 'next/server';
import { scanner } from '@/lib/filesystem';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
  try {
    // Create a new sync job
    const syncJob = await prisma.syncJob.create({
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    // Start the sync process (in a real app, this would be a background job)
    syncPhotos(syncJob.id).catch(console.error);

    return NextResponse.json({
      jobId: syncJob.id,
      status: 'started',
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    return NextResponse.json(
      { error: 'Failed to start sync' },
      { status: 500 }
    );
  }
}

async function syncPhotos(jobId: string) {
  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0 },
    });

    // Get all albums from filesystem
    const albumPaths = await scanner.getAllAlbums();
    let progress = 0;
    const totalAlbums = albumPaths.length;

    for (const albumPath of albumPaths) {
      try {
        const albumData = await scanner.scanDirectory(albumPath);
        
        // Upsert album
        const album = await prisma.album.upsert({
          where: { path: albumPath },
          update: {
            name: albumData.name,
            description: albumData.description,
            updatedAt: new Date(),
          },
          create: {
            path: albumPath,
            name: albumData.name,
            description: albumData.description,
            status: 'PUBLIC',
            enabled: true,
          },
        });

        // Update photos for this album
        await syncAlbumPhotos(album.id, albumData.photos, albumPath);
        
        progress++;
        const progressPercent = Math.round((progress / totalAlbums) * 100);
        
        await prisma.syncJob.update({
          where: { id: jobId },
          data: { progress: progressPercent },
        });
      } catch (error) {
        console.error(`Error syncing album ${albumPath}:`, error);
      }
    }

    // Mark job as completed
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Sync job failed:', error);
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errors: JSON.stringify({ error: error.message }),
      },
    });
  }
}

async function syncAlbumPhotos(albumId: string, photos: any[], albumPath: string) {
  // Get existing photos for this album
  const existingPhotos = await prisma.photo.findMany({
    where: { albumId },
    select: { filename: true, id: true, s3Key: true },
  });

  const existingFilenames = new Set(existingPhotos.map((p: any) => p.filename));
  const currentFilenames = new Set(photos.map((p: any) => p.filename));

  // Remove photos that no longer exist
  const photosToDelete = existingPhotos.filter((p: any) => !currentFilenames.has(p.filename));
  for (const photo of photosToDelete) {
    try {
      // Delete from S3
      await s3.deleteObject(photo.s3Key);
    } catch (error) {
      console.error(`Error deleting S3 object ${photo.s3Key}:`, error);
    }
    // Delete from database
    await prisma.photo.delete({ where: { id: photo.id } });
  }

  // Add or update photos
  for (const photoData of photos) {
    const photoPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath, photoData.filename);
    const s3Key = s3.generateKey(albumPath, photoData.filename);
    
    if (!existingFilenames.has(photoData.filename)) {
      try {
        // Upload photo to S3
        const fileBuffer = await fs.readFile(photoPath);
        const mimeType = getContentType(photoData.filename);
        
        await s3.uploadFile(s3Key, fileBuffer, mimeType);
        
        // Create database entry
        await prisma.photo.create({
          data: {
            albumId,
            filename: photoData.filename,
            originalPath: photoPath,
            s3Key: s3Key,
            metadata: JSON.stringify(photoData),
            fileSize: photoData.size,
            takenAt: photoData.takenAt || null,
          },
        });
        
        console.log(`Uploaded ${photoData.filename} to S3`);
      } catch (error) {
        console.error(`Error uploading ${photoData.filename}:`, error);
      }
    } else {
      // Update existing photo metadata (no need to re-upload unless file changed)
      await prisma.photo.updateMany({
        where: {
          albumId,
          filename: photoData.filename,
        },
        data: {
          metadata: JSON.stringify(photoData),
          fileSize: photoData.size,
          takenAt: photoData.takenAt || null,
        },
      });
    }
  }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}
