import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function getAnalyticsData() {
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    contentGrowthRaw,
    videoGrowthRaw,
    mediaTimelineRaw,
    storageByAlbumRaw,
    totalPhotos,
    totalVideos,
    totalAlbums,
    recentPhotos,
    recentVideos,
    prevPeriodPhotos,
    allPhotos,
    allVideos,
  ] = await Promise.all([
    // Content growth: photos by month created
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM photos
      WHERE "createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month
    `,
    // Video growth by month created
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM videos
      WHERE "createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month
    `,
    // Media timeline: photos by month taken
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("takenAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM photos
      WHERE "takenAt" IS NOT NULL
      GROUP BY TO_CHAR("takenAt", 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 24
    `,
    // Storage by album (top 10)
    prisma.$queryRaw<{ name: string; total_size: bigint }[]>`
      SELECT a.name, COALESCE(SUM(p."fileSize"), 0) + COALESCE(v.video_size, 0) as total_size
      FROM albums a
      LEFT JOIN photos p ON p."albumId" = a.id
      LEFT JOIN (
        SELECT "albumId", SUM("fileSize") as video_size
        FROM videos
        GROUP BY "albumId"
      ) v ON v."albumId" = a.id
      GROUP BY a.id, a.name, v.video_size
      ORDER BY total_size DESC
      LIMIT 10
    `,
    prisma.photo.count(),
    prisma.video.count(),
    prisma.album.count(),
    prisma.photo.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.video.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.photo.count({
      where: {
        createdAt: {
          gte: new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000),
          lt: thirtyDaysAgo,
        },
      },
    }),
    prisma.photo.findMany({ select: { filename: true } }),
    prisma.video.findMany({ select: { codec: true } }),
  ])

  // Content growth: merge photos + videos by month
  const monthMap = new Map<string, { photos: number; videos: number }>()
  for (const row of contentGrowthRaw) {
    const existing = monthMap.get(row.month) || { photos: 0, videos: 0 }
    existing.photos = Number(row.count)
    monthMap.set(row.month, existing)
  }
  for (const row of videoGrowthRaw) {
    const existing = monthMap.get(row.month) || { photos: 0, videos: 0 }
    existing.videos = Number(row.count)
    monthMap.set(row.month, existing)
  }
  const contentGrowth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }))

  // Media timeline
  const mediaTimeline = mediaTimelineRaw
    .map((r) => ({ month: r.month, count: Number(r.count) }))
    .reverse()

  // Storage by album
  const storageByAlbum = storageByAlbumRaw.map((r) => ({
    name: r.name,
    sizeBytes: Number(r.total_size),
    sizeFormatted: formatBytes(Number(r.total_size)),
  }))

  // Photo format distribution
  const formatCounts = new Map<string, number>()
  for (const p of allPhotos) {
    const ext = p.filename.split('.').pop()?.toLowerCase() || 'unknown'
    formatCounts.set(ext, (formatCounts.get(ext) || 0) + 1)
  }
  const photoFormats = Array.from(formatCounts.entries())
    .map(([name, count]) => ({ name: name.toUpperCase(), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Video codec distribution
  const codecCounts = new Map<string, number>()
  for (const v of allVideos) {
    const codec = v.codec || 'Unknown'
    codecCounts.set(codec, (codecCounts.get(codec) || 0) + 1)
  }
  const videoCodecs = Array.from(codecCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Total storage
  const totalPhotoSize = await prisma.photo.aggregate({ _sum: { fileSize: true } })
  const totalVideoSize = await prisma.video.aggregate({ _sum: { fileSize: true } })
  const totalStorage = (totalPhotoSize._sum.fileSize || 0) + (totalVideoSize._sum.fileSize || 0)

  // Growth percentage
  const photoGrowthPct = prevPeriodPhotos > 0
    ? Math.round(((recentPhotos - prevPeriodPhotos) / prevPeriodPhotos) * 100)
    : recentPhotos > 0 ? 100 : 0

  return {
    summary: {
      totalMedia: totalPhotos + totalVideos,
      totalAlbums,
      totalStorage: formatBytes(totalStorage),
      recentPhotos,
      photoGrowthPct,
      recentVideos,
    },
    contentGrowth,
    mediaTimeline,
    storageByAlbum,
    photoFormats,
    videoCodecs,
  }
}

export async function GET() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const data = await getAnalyticsData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to load analytics data' },
      { status: 500 }
    )
  }
}
