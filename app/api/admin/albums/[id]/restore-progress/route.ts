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

// Helper function to create SSE response
function createSSEResponse() {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const data = `data: ${JSON.stringify({ type: 'connected' })}\n\n`
      controller.enqueue(encoder.encode(data))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}

// Helper function to send SSE message
function sendSSEMessage(controller: ReadableStreamDefaultController, data: any) {
  const encoder = new TextEncoder()
  const message = `data: ${JSON.stringify(data)}\n\n`
  controller.enqueue(encoder.encode(message))
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

    if (!missingFiles || !Array.isArray(missingFiles) || missingFiles.length === 0) {
      return NextResponse.json(
        { error: 'No missing files specified for restoration' },
        { status: 400 }
      )
    }

    // Get admin settings for batch size
    const settings = await getSiteSettings()
    const batchSize = parseInt(settings.batchProcessingSize || '4', 10)

    // Get album details
    const album = await prisma.album.findUnique({
      where: { id },
      include: { photos: true }
    })

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    // Ensure local directory exists
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    const albumPath = path.join(photosRoot, album.path)
    
    try {
      await fs.mkdir(albumPath, { recursive: true })
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to create album directory' },
        { status: 500 }
      )
    }

    const encoder = new TextEncoder()
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial progress
          sendSSEMessage(controller, {
            type: 'progress',
            current: 0,
            total: missingFiles.length,
            message: 'Starting restoration...',
            batchSize
          })

          const totalFiles = missingFiles.length
          const allRestoredFiles: string[] = []
          const allFailedFiles: Array<{ file: string, error: string }> = []

          // Create batches
          const batches: string[][] = []
          for (let i = 0; i < totalFiles; i += batchSize) {
            batches.push(missingFiles.slice(i, i + batchSize))
          }

          // Process batches
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex]
            
            sendSSEMessage(controller, {
              type: 'progress',
              current: allRestoredFiles.length + allFailedFiles.length,
              total: totalFiles,
              message: `Processing batch ${batchIndex + 1}/${batches.length}...`,
              batchIndex: batchIndex + 1,
              totalBatches: batches.length
            })

            // Process batch concurrently
            const batchResults = await Promise.allSettled(
              batch.map(async (filename) => {
                try {
                  // Find the photo record to get the S3 key
                  const photo = album.photos.find(p => p.filename === filename)
                  if (!photo) {
                    throw new Error('Not found in database')
                  }

                  // Download from S3
                  const buffer = await s3.getObject(photo.s3Key)

                  // Write to local filesystem
                  const localFilePath = path.join(albumPath, filename)
                  await fs.writeFile(localFilePath, buffer)

                  return { success: true, filename }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                  return { success: false, filename, error: errorMessage }
                }
              })
            )

            // Process results
            for (const result of batchResults) {
              if (result.status === 'fulfilled') {
                if (result.value.success) {
                  allRestoredFiles.push(result.value.filename)
                } else {
                  allFailedFiles.push({ 
                    file: result.value.filename, 
                    error: result.value.error || 'Unknown error' 
                  })
                }
              } else {
                allFailedFiles.push({ 
                  file: 'unknown', 
                  error: result.reason?.message || 'Promise rejected' 
                })
              }

              // Send progress update after each file
              sendSSEMessage(controller, {
                type: 'progress',
                current: allRestoredFiles.length + allFailedFiles.length,
                total: totalFiles,
                message: `Processed ${allRestoredFiles.length + allFailedFiles.length}/${totalFiles} files...`,
                restored: allRestoredFiles.length,
                failed: allFailedFiles.length
              })
            }
          }

          // Check if album should be marked as complete
          let albumUpdated = false
          if (allFailedFiles.length === 0 && allRestoredFiles.length > 0) {
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
              }
            } catch (error) {
              console.error('Error checking album completeness:', error)
            }
          }

          // Send final result
          sendSSEMessage(controller, {
            type: 'complete',
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
          sendSSEMessage(controller, {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    })

  } catch (error) {
    console.error('Error in restore progress endpoint:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
