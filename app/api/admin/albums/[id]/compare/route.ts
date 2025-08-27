import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { s3 } from '@/lib/s3'
import { scanner } from '@/lib/filesystem'
import fs from 'fs/promises'
import path from 'path'

interface Params {
  id: string
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

    // Get album details
    const album = await prisma.album.findUnique({
      where: { id },
      include: { photos: true }
    })

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    const comparison = {
      albumName: album.name,
      albumPath: album.path,
      localFiles: [] as string[],
      s3Files: [] as string[],
      databaseFiles: [] as string[],
      localOnly: [] as string[],
      s3Only: [] as string[],
      databaseOnly: [] as string[],
      missing: {
        localMissingFromS3: [] as string[],
        localMissingFromDB: [] as string[],
        s3MissingFromLocal: [] as string[],
        s3MissingFromDB: [] as string[],
        dbMissingFromLocal: [] as string[],
        dbMissingFromS3: [] as string[]
      },
      errors: [] as string[]
    }

    try {
      // 1. Get local files
      const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
      const albumPath = path.join(photosRoot, album.path)
      console.log(`[COMPARISON] Album: ${album.name}, Local path: "${albumPath}"`)
      
      try {
        await fs.access(albumPath)
        const albumData = await scanner.scanDirectory(album.path)
        comparison.localFiles = albumData.photos.map(p => p.filename).sort()
        console.log(`[COMPARISON] Found ${comparison.localFiles.length} local files`)
      } catch (error) {
        console.error(`[COMPARISON] Local directory access error:`, error)
        comparison.errors.push(`Cannot access local directory: ${albumPath}`)
      }

      // 2. Get S3 files
      try {
        // S3 files are stored with 'photos/' prefix and cleaned characters
        const cleanAlbumPath = album.path.replace(/^\/+|\/+$/g, '').replace(/[<>:"|?*]/g, '_')
        const s3Prefix = `photos/${cleanAlbumPath}/`
        console.log(`[COMPARISON] Album: ${album.name}, S3 Prefix: "${s3Prefix}"`)
        const s3Objects = await s3.listObjects(s3Prefix)
        console.log(`[COMPARISON] Found ${s3Objects.length} S3 objects for prefix "${s3Prefix}"`)
        console.log(`[COMPARISON] S3 objects:`, s3Objects.slice(0, 5)) // Show first 5 for debugging
        
        // Extract filenames but use original names from database for comparison
        const s3Keys = new Set(s3Objects.filter(key => /\.(jpg|jpeg|png|gif|webp)$/i.test(key)))
        
        // Map database files to their expected S3 keys and check if they exist
        const dbFilesInS3: string[] = []
        const dbFilesNotInS3: string[] = []
        
        for (const dbPhoto of album.photos) {
          if (dbPhoto.s3Key) {
            if (s3Keys.has(dbPhoto.s3Key)) {
              dbFilesInS3.push(dbPhoto.filename)
            } else {
              dbFilesNotInS3.push(dbPhoto.filename)
              console.log(`[COMPARISON] DB photo ${dbPhoto.filename} with S3 key ${dbPhoto.s3Key} not found in S3`)
            }
          } else {
            // Photo doesn't have S3 key, generate expected key
            const expectedKey = s3.generateKey(album.path, dbPhoto.filename)
            if (s3Keys.has(expectedKey)) {
              dbFilesInS3.push(dbPhoto.filename)
            } else {
              dbFilesNotInS3.push(dbPhoto.filename)
              console.log(`[COMPARISON] DB photo ${dbPhoto.filename} with expected S3 key ${expectedKey} not found in S3`)
            }
          }
        }
        
        // For UI display, show the filenames (not S3 keys)
        comparison.s3Files = dbFilesInS3.sort()
        
        console.log(`[COMPARISON] Files found in S3: ${dbFilesInS3.length}`)
        console.log(`[COMPARISON] Files NOT found in S3: ${dbFilesNotInS3.length}`)
      } catch (error) {
        console.error(`[COMPARISON] S3 listing error:`, error)
        comparison.errors.push(`Cannot list S3 objects: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // 3. Get database files
      comparison.databaseFiles = album.photos.map((p: any) => p.filename).sort()
      console.log(`[COMPARISON] Found ${comparison.databaseFiles.length} database records`)

      console.log(`[COMPARISON] Summary - Local: ${comparison.localFiles.length}, S3: ${comparison.s3Files.length}, DB: ${comparison.databaseFiles.length}`)

      // 4. Calculate differences
      const localSet = new Set(comparison.localFiles)
      const s3Set = new Set(comparison.s3Files)
      const dbSet = new Set(comparison.databaseFiles)

      // Files only in one location
      comparison.localOnly = comparison.localFiles.filter(f => !s3Set.has(f) && !dbSet.has(f))
      comparison.s3Only = comparison.s3Files.filter(f => !localSet.has(f) && !dbSet.has(f))
      comparison.databaseOnly = comparison.databaseFiles.filter(f => !localSet.has(f) && !s3Set.has(f))

      // Missing files (in one but not another)
      comparison.missing.localMissingFromS3 = comparison.localFiles.filter(f => !s3Set.has(f))
      comparison.missing.localMissingFromDB = comparison.localFiles.filter(f => !dbSet.has(f))
      comparison.missing.s3MissingFromLocal = comparison.s3Files.filter(f => !localSet.has(f))
      comparison.missing.s3MissingFromDB = comparison.s3Files.filter(f => !dbSet.has(f))
      comparison.missing.dbMissingFromLocal = comparison.databaseFiles.filter(f => !localSet.has(f))
      comparison.missing.dbMissingFromS3 = comparison.databaseFiles.filter(f => !s3Set.has(f))

      // 5. Add file size comparison for files that exist in multiple locations
      const detailedComparison: any[] = []
      for (const filename of localSet) {
        if (s3Set.has(filename) || dbSet.has(filename)) {
          const fileInfo: any = { filename }
          
          // Get local file size
          if (localSet.has(filename)) {
            try {
              const localPath = path.join(albumPath, filename)
              const stats = await fs.stat(localPath)
              fileInfo.localSize = stats.size
              fileInfo.localModified = stats.mtime.toISOString()
            } catch (error) {
              fileInfo.localError = 'Cannot read local file'
            }
          }

          // Get database file size
          const dbPhoto = album.photos.find((p: any) => p.filename === filename)
          if (dbPhoto) {
            fileInfo.dbSize = dbPhoto.fileSize
            fileInfo.dbCreated = dbPhoto.createdAt.toISOString()
            fileInfo.s3Key = dbPhoto.s3Key
          }

          detailedComparison.push(fileInfo)
        }
      }

      // Check if there are any inconsistencies
      const totalInconsistencies = comparison.localOnly.length + comparison.s3Only.length + comparison.databaseOnly.length +
                                  comparison.missing.localMissingFromS3.length + comparison.missing.s3MissingFromLocal.length +
                                  comparison.missing.dbMissingFromLocal.length + comparison.missing.dbMissingFromS3.length

      // If no inconsistencies and album is synced, mark as safe to delete
      let albumUpdated = false
      if (totalInconsistencies === 0 && comparison.localFiles.length > 0 && comparison.s3Files.length > 0) {
        try {
          await prisma.album.update({
            where: { id },
            data: { 
              localFilesSafeDelete: true,
              lastSyncAt: new Date()
            }
          })
          albumUpdated = true
          console.log(`[COMPARISON] Album ${album.name} marked as safe to delete - no inconsistencies found`)
        } catch (updateError) {
          console.error(`[COMPARISON] Failed to mark album as safe to delete:`, updateError)
          comparison.errors.push('Failed to mark album as safe to delete')
        }
      }

      return NextResponse.json({
        success: true,
        albumUpdated,
        comparison: {
          ...comparison,
          detailedComparison,
          summary: {
            totalLocal: comparison.localFiles.length,
            totalS3: comparison.s3Files.length,
            totalDatabase: comparison.databaseFiles.length,
            inconsistencies: totalInconsistencies
          }
        }
      })
    } catch (error) {
      comparison.errors.push(`Comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return NextResponse.json({
        success: false,
        comparison,
        error: 'Comparison completed with errors'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Error comparing album:', error)
    return NextResponse.json(
      { error: 'Failed to compare album' },
      { status: 500 }
    )
  }
}
