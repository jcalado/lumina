import { NextRequest, NextResponse } from 'next/server'
import { requireAlbumAccess } from '@/lib/album-auth'
import { prisma } from '@/lib/prisma'
import { getS3Service } from '@/lib/s3'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAlbumAccess(id, 'can_upload')
    if (authResult instanceof NextResponse) {
      return authResult
    }

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

    const uploads = await Promise.all(
      files.map(async (file: { filename: string; contentType: string; size: number }) => {
        if (!file.filename || !file.contentType) {
          throw new Error(`Invalid file entry: missing filename or contentType`)
        }

        const sanitizedFilename = file.filename
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, '_')

        const s3Key = s3.generateKey(album.path, sanitizedFilename)
        const presignedUrl = await s3.getPresignedUploadUrl(s3Key, file.contentType)

        return {
          filename: file.filename,
          sanitizedFilename,
          s3Key,
          presignedUrl,
        }
      })
    )

    return NextResponse.json({ uploads })
  } catch (error) {
    console.error('[PRESIGN] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate presigned URLs' },
      { status: 500 }
    )
  }
}
