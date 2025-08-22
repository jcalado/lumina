import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  generateAlbumFingerprint, 
  stringifyFingerprint,
  parseFingerprintString,
  compareFingerprints 
} from '@/lib/sync-fingerprint';
import { scanner } from '@/lib/filesystem';
import path from 'path';

/**
 * API endpoint to update album fingerprints for all albums
 * This is a temporary solution while Prisma types are being updated
 */
export async function POST() {
  try {
    const logs: Array<{timestamp: string, level: string, message: string}> = [];
    
    const addLog = (level: 'info' | 'warn' | 'error', message: string) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message
      };
      logs.push(logEntry);
      console.log(`[${level.toUpperCase()}] ${message}`);
    };

    addLog('info', 'Starting fingerprint update process');

    // Get all albums from database
    const albums = await prisma.album.findMany({
      select: { id: true, path: true, name: true, description: true }
    });

    let updated = 0;
    let errors = 0;

    for (const album of albums) {
      try {
        // Convert relative path to absolute path for fingerprint generation
        const absoluteAlbumPath = path.join(process.env.PHOTOS_ROOT_PATH || '', album.path);
        
        // Generate fingerprint for this album
        const fingerprint = await generateAlbumFingerprint(absoluteAlbumPath, {
          name: album.name,
          description: album.description || undefined
        });

        // Use raw SQL to update the new fields (temporary workaround)
        await prisma.$executeRaw`
          UPDATE albums 
          SET 
            syncFingerprint = ${stringifyFingerprint(fingerprint)},
            lastSyncCheck = ${new Date()},
            syncStatus = 'PENDING'
          WHERE id = ${album.id}
        `;

        addLog('info', `Updated fingerprint for album: ${album.name}`);
        updated++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Failed to update fingerprint for album ${album.name}: ${errorMsg}`);
        errors++;
      }
    }

    addLog('info', `Fingerprint update complete. Updated: ${updated}, Errors: ${errors}`);

    return NextResponse.json({
      success: true,
      updated,
      errors,
      logs
    });
  } catch (error) {
    console.error('Error updating fingerprints:', error);
    return NextResponse.json(
      { error: 'Failed to update fingerprints', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * API endpoint to check if an album should be skipped during sync
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const albumPath = searchParams.get('path');

    if (!albumPath) {
      return NextResponse.json(
        { error: 'Album path is required' },
        { status: 400 }
      );
    }

    // Get album data from filesystem
    const albumData = await scanner.scanDirectory(albumPath);
    
    // Convert relative path to absolute path for fingerprint generation
    const absoluteAlbumPath = path.join(process.env.PHOTOS_ROOT_PATH || '', albumPath);
    
    // Generate current fingerprint
    const currentFingerprint = await generateAlbumFingerprint(absoluteAlbumPath, {
      name: albumData.name,
      description: albumData.description || undefined
    });

    // Get album from database (using raw query for now)
    const albumResult = await prisma.$queryRaw`
      SELECT id, syncFingerprint, lastSyncCheck, syncStatus 
      FROM albums 
      WHERE path = ${albumPath}
    ` as any[];

    if (albumResult.length === 0) {
      return NextResponse.json({
        shouldSkip: false,
        reason: 'Album not found in database',
        currentFingerprint
      });
    }

    const album = albumResult[0];
    const previousFingerprint = parseFingerprintString(album.syncFingerprint);
    
    if (!previousFingerprint) {
      return NextResponse.json({
        shouldSkip: false,
        reason: 'No previous fingerprint',
        currentFingerprint
      });
    }

    const comparison = compareFingerprints(currentFingerprint, previousFingerprint);
    
    // Check time since last check
    const lastCheck = album.lastSyncCheck ? new Date(album.lastSyncCheck) : null;
    const hoursSinceLastCheck = lastCheck ? 
      (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60) : Infinity;

    return NextResponse.json({
      shouldSkip: !comparison.hasChanged && hoursSinceLastCheck < 1,
      reason: comparison.hasChanged ? comparison.reason : 
              hoursSinceLastCheck < 1 ? `Recent check (${hoursSinceLastCheck.toFixed(1)}h ago)` : 'Ready for sync',
      hasChanged: comparison.hasChanged,
      hoursSinceLastCheck,
      currentFingerprint,
      previousFingerprint
    });

  } catch (error) {
    console.error('Error checking album fingerprint:', error);
    return NextResponse.json(
      { error: 'Failed to check album fingerprint', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
