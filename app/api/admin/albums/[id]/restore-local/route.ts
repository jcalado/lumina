import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { s3 } from '@/lib/s3'
import { getSiteSettings } from '@/lib/settings'
import fs from 'fs/promises'
import path from 'path'

interface Params {
  id: string
}

// Helper function to process files in batches
async function processBatch(
  albumPath: string,
  photos: Array<{ filename: string; s3Key: string }>,
  batch: string[]
): Promise<{ restored: string[], failed: Array<{ file: string, error: string }> }> {
  const restored: string[] = []
  const failed: Array<{ file: string, error: string }> = []

  // Process batch concurrently
  await Promise.all(
    batch.map(async (filename) => {
      try {
        console.log(`[RESTORE FILES] Processing file: ${filename}`)

        // Find the photo record to get the S3 key
        const photo = photos.find((p: { filename: string; s3Key: string }) => p.filename === filename)
        if (!photo) {
          console.log(`[RESTORE FILES] Photo record not found for: ${filename}`)
          failed.push({ file: filename, error: 'Not found in database' })
          return
        }

        // Download from S3
        console.log(`[RESTORE FILES] Downloading from S3: ${photo.s3Key}`)
        const buffer = await s3.getObject(photo.s3Key)

        // Write to local filesystem
        const localFilePath = path.join(albumPath, filename)
        await fs.writeFile(localFilePath, buffer)

        console.log(`[RESTORE FILES] Successfully restored: ${filename}`)
        restored.push(filename)

      } catch (error) {
        console.error(`[RESTORE FILES] Error restoring ${filename}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        failed.push({ file: filename, error: errorMessage })
      }
    })
  )

  return { restored, failed }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await context.params
    const { missingFiles } = await request.json()

    console.log(`[RESTORE FILES] Starting restore process for album ID: ${id}`)
    console.log(`[RESTORE FILES] Files to restore: ${missingFiles?.length || 0}`)

    if (!missingFiles || !Array.isArray(missingFiles) || missingFiles.length === 0) {
      return NextResponse.json(
        { error: 'No missing files specified for restoration' },
        { status: 400 }
      )
    }

    // Get admin settings for batch size
    const settings = await getSiteSettings()
    const batchSize = parseInt(settings.batchProcessingSize || '4', 10)
    console.log(`[RESTORE FILES] Using batch size: ${batchSize}`)

    // Get album details
    const album = await prisma.album.findUnique({
      where: { id },
      include: { photos: true }
    })

    if (!album) {
      console.log(`[RESTORE FILES] Album not found: ${id}`)
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    console.log(`[RESTORE FILES] Found album: ${album.name} (${album.path})`)

    // Ensure local directory exists
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    const albumPath = path.join(photosRoot, album.path)
    
    console.log(`[RESTORE FILES] Album path: ${albumPath}`)

    try {
      await fs.mkdir(albumPath, { recursive: true })
      console.log(`[RESTORE FILES] Ensured directory exists: ${albumPath}`)
    } catch (error) {
      console.error(`[RESTORE FILES] Error creating directory:`, error)
      return NextResponse.json(
        { error: 'Failed to create album directory' },
        { status: 500 }
      )
    }

    const totalFiles = missingFiles.length
    const allRestoredFiles: string[] = []
    const allFailedFiles: Array<{ file: string, error: string }> = []

    // Create batches
    const batches: string[][] = []
    for (let i = 0; i < totalFiles; i += batchSize) {
      batches.push(missingFiles.slice(i, i + batchSize))
    }

    console.log(`[RESTORE FILES] Processing ${totalFiles} files in ${batches.length} batches of size ${batchSize}`)

    // Process batches sequentially to avoid overwhelming the system
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`[RESTORE FILES] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} files)`)

      const { restored, failed } = await processBatch(albumPath, album.photos, batch)
      
      allRestoredFiles.push(...restored)
      allFailedFiles.push(...failed)

      console.log(`[RESTORE FILES] Batch ${batchIndex + 1} complete. Restored: ${restored.length}, Failed: ${failed.length}`)
    }

    console.log(`[RESTORE FILES] All batches complete. Total restored: ${allRestoredFiles.length}, Total failed: ${allFailedFiles.length}`)

    // If all files were restored successfully, mark album as synced
    let albumUpdated = false
    if (allFailedFiles.length === 0 && allRestoredFiles.length > 0) {
      // Check if this makes the album complete
      try {
        const albumFiles = await fs.readdir(albumPath)
        const imageFiles = albumFiles.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/i.test(file))
        
        if (imageFiles.length === album.photos.length) {
          await prisma.album.update({
            where: { id },
            data: {
              localFilesSafeDelete: true
            }
          })
          albumUpdated = true
          console.log(`[RESTORE FILES] Album marked as complete and safe for deletion`)
        }
      } catch (error) {
        console.error(`[RESTORE FILES] Error checking album completeness:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Restored ${allRestoredFiles.length} file(s) successfully`,
      restoredFiles: allRestoredFiles,
      failedFiles: allFailedFiles.map(f => `${f.file} (${f.error})`),
      albumUpdated,
      stats: {
        total: totalFiles,
        restored: allRestoredFiles.length,
        failed: allFailedFiles.length,
        batchesProcessed: batches.length,
        batchSize
      }
    })

  } catch (error) {
    console.error('[RESTORE FILES] Error in restoration process:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to restore files: ${errorMessage}` },
      { status: 500 }
    )
  }
}
