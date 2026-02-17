import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { getS3Service } from '@/lib/s3'
import { enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue'
import { enqueueBlurhashJob } from '@/lib/queues/blurhashQueue'
import { enqueueExifJob } from '@/lib/queues/exifQueue'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await params

    const album = await prisma.album.findUnique({
      where: { id },
    })

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    const { files } = await request.json()

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'files array is required' },
        { status: 400 }
      )
    }

    const s3 = getS3Service()
    const created: string[] = []
    const errors: Array<{ filename: string; error: string }> = []

    for (const file of files as Array<{ filename: string; s3Key: string; size: number; contentType: string }>) {
      try {
        // Verify the file exists on S3
        const exists = await s3.objectExists(file.s3Key)
        if (!exists) {
          errors.push({ filename: file.filename, error: 'File not found on S3' })
          continue
        }

        // Create Photo record
        const photo = await prisma.photo.create({
          data: {
            albumId: id,
            filename: file.filename,
            s3Key: file.s3Key,
            fileSize: file.size,
          },
        })

        created.push(photo.id)

        // Enqueue post-processing jobs
        await enqueueThumbnailJob({
          photoId: photo.id,
          s3Key: file.s3Key,
          albumPath: album.path,
          filename: file.filename,
        })

        await enqueueBlurhashJob({
          photoId: photo.id,
          s3Key: file.s3Key,
        })

        await enqueueExifJob({ photoId: photo.id })
      } catch (error) {
        errors.push({
          filename: file.filename,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      created: created.length,
      errors,
      jobs: {
        thumbnails: created.length,
        blurhash: created.length,
        exif: created.length,
      },
    })
  } catch (error) {
    console.error('[CONFIRM-UPLOAD] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm upload' },
      { status: 500 }
    )
  }
}
