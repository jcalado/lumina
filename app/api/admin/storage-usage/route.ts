import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper function to get S3 storage usage from database records
async function getS3StorageUsage(): Promise<{ totalSize: number; objectCount: number }> {
  try {
    const [photos, videos] = await Promise.all([
      prisma.photo.findMany({
        select: { fileSize: true },
        where: { s3Key: { not: '' } },
      }),
      prisma.video.findMany({
        select: { fileSize: true },
        where: { s3Key: { not: '' } },
      }),
    ])

    const photoSize = photos.reduce((sum: number, p: { fileSize: number | null }) => sum + (p.fileSize || 0), 0)
    const videoSize = videos.reduce((sum: number, v: { fileSize: number | null }) => sum + (v.fileSize || 0), 0)

    return { totalSize: photoSize + videoSize, objectCount: photos.length + videos.length }
  } catch (error) {
    console.error('Error calculating S3 storage usage:', error)
    return { totalSize: 0, objectCount: 0 }
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    console.log('[STORAGE USAGE] Calculating S3 storage usage...')
    const s3Usage = await getS3StorageUsage()
    console.log(`[STORAGE USAGE] S3 storage: ${formatBytes(s3Usage.totalSize)}, Objects: ${s3Usage.objectCount}`)

    const response = {
      remote: {
        size: s3Usage.totalSize,
        sizeFormatted: formatBytes(s3Usage.totalSize),
        objectCount: s3Usage.objectCount,
      },
      total: {
        size: s3Usage.totalSize,
        sizeFormatted: formatBytes(s3Usage.totalSize)
      },
      lastUpdated: new Date().toISOString()
    }

    console.log('[STORAGE USAGE] Calculation complete:', response)

    return NextResponse.json(response)

  } catch (error) {
    console.error('[STORAGE USAGE] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to calculate storage usage: ${errorMessage}` },
      { status: 500 }
    )
  }
}
