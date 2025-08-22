import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { scanner } from '@/lib/filesystem'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    console.log('[RECONCILIATION] Starting reconciliation analysis...')

    // Get all albums from filesystem
    const filesystemAlbums = await scanner.getAllAlbums()
    
    // Get all albums from database
    const databaseAlbums = await prisma.album.findMany({
      select: { 
        id: true, 
        path: true, 
        name: true, 
        syncedToS3: true, 
        localFilesSafeDelete: true,
        lastSyncAt: true,
        _count: {
          select: {
            photos: true
          }
        }
      },
    })

    console.log(`[RECONCILIATION] Found ${filesystemAlbums.length} albums in filesystem`)
    console.log(`[RECONCILIATION] Found ${databaseAlbums.length} albums in database`)

    const filesystemAlbumSet = new Set(filesystemAlbums)
    const databaseAlbumPaths = new Set(databaseAlbums.map(a => a.path))

    // Albums in database but not in filesystem (orphaned)
    const orphanedAlbums = []
    // Albums in filesystem but not in database (new)
    const newAlbums = []
    // Albums in both (synced)
    const syncedAlbums = []

    // Analyze database albums
    for (const dbAlbum of databaseAlbums) {
      if (!filesystemAlbumSet.has(dbAlbum.path)) {
        // Get detailed info about S3 photos
        const s3PhotoCount = await prisma.photo.count({
          where: {
            albumId: dbAlbum.id,
            s3Key: { not: '' }
          }
        })

        orphanedAlbums.push({
          ...dbAlbum,
          s3PhotoCount,
          totalPhotoCount: dbAlbum._count.photos,
          hasS3Files: s3PhotoCount > 0,
          isFullySynced: dbAlbum.syncedToS3 && s3PhotoCount === dbAlbum._count.photos,
          recommendedAction: s3PhotoCount === 0 ? 'cleanup' : 
                           (dbAlbum.syncedToS3 && s3PhotoCount === dbAlbum._count.photos) ? 'recoverable' : 'review'
        })
      } else {
        syncedAlbums.push(dbAlbum)
      }
    }

    // Analyze filesystem albums
    for (const fsAlbum of filesystemAlbums) {
      if (!databaseAlbumPaths.has(fsAlbum)) {
        newAlbums.push({
          path: fsAlbum,
          name: fsAlbum.split('/').pop() || fsAlbum,
          inDatabase: false
        })
      }
    }

    // Calculate statistics
    const stats = {
      total: {
        filesystem: filesystemAlbums.length,
        database: databaseAlbums.length,
        orphaned: orphanedAlbums.length,
        new: newAlbums.length,
        synced: syncedAlbums.length
      },
      orphaned: {
        cleanupNeeded: orphanedAlbums.filter(a => a.recommendedAction === 'cleanup').length,
        recoverable: orphanedAlbums.filter(a => a.recommendedAction === 'recoverable').length,
        needsReview: orphanedAlbums.filter(a => a.recommendedAction === 'review').length
      }
    }

    const response = {
      stats,
      orphanedAlbums: orphanedAlbums.slice(0, 20), // Limit to first 20 for UI
      newAlbums: newAlbums.slice(0, 20),
      syncedAlbums: syncedAlbums.slice(0, 10),
      lastAnalyzed: new Date().toISOString(),
      summary: {
        hasIssues: orphanedAlbums.length > 0 || newAlbums.length > 0,
        message: orphanedAlbums.length === 0 && newAlbums.length === 0 
          ? 'All albums are properly synchronized'
          : `Found ${orphanedAlbums.length} orphaned albums and ${newAlbums.length} new albums requiring attention`
      }
    }

    console.log('[RECONCILIATION] Analysis complete:', response.summary)

    return NextResponse.json(response)

  } catch (error) {
    console.error('[RECONCILIATION] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to analyze reconciliation: ${errorMessage}` },
      { status: 500 }
    )
  }
}
