import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Image, FolderOpen, HardDrive, Camera, Video } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { AnalyticsCharts } from "./analytics-charts"

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-20" />
            </CardHeader>
            <CardContent>
              <div className="h-7 bg-muted rounded w-16 mb-1" />
              <div className="h-3 bg-muted rounded w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-5 bg-muted rounded w-40" />
              <div className="h-4 bg-muted rounded w-60" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
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
    photoFilenames,
    videoCodecsRaw,
    totalPhotoSize,
    totalVideoSize,
  ] = await Promise.all([
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM photos
      WHERE "createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month
    `,
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM videos
      WHERE "createdAt" >= ${twelveMonthsAgo}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month
    `,
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR("takenAt", 'YYYY-MM') as month, COUNT(*) as count
      FROM photos
      WHERE "takenAt" IS NOT NULL
      GROUP BY TO_CHAR("takenAt", 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 24
    `,
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
    prisma.$queryRaw<{ ext: string; count: bigint }[]>`
      SELECT LOWER(SUBSTRING(filename FROM '\.([^.]+)$')) as ext, COUNT(*) as count
      FROM photos
      GROUP BY ext
      ORDER BY count DESC
      LIMIT 8
    `,
    prisma.$queryRaw<{ codec: string; count: bigint }[]>`
      SELECT COALESCE(codec, 'Unknown') as codec, COUNT(*) as count
      FROM videos
      GROUP BY codec
      ORDER BY count DESC
      LIMIT 8
    `,
    prisma.photo.aggregate({ _sum: { fileSize: true } }),
    prisma.video.aggregate({ _sum: { fileSize: true } }),
  ])

  // Merge content growth
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

  const mediaTimeline = mediaTimelineRaw
    .map((r) => ({ month: r.month, count: Number(r.count) }))
    .reverse()

  const storageByAlbum = storageByAlbumRaw.map((r) => ({
    name: r.name,
    sizeBytes: Number(r.total_size),
    sizeFormatted: formatBytes(Number(r.total_size)),
  }))

  const photoFormats = photoFilenames.map((r) => ({
    name: (r.ext || 'unknown').toUpperCase(),
    count: Number(r.count),
  }))

  const videoCodecs = videoCodecsRaw.map((r) => ({
    name: r.codec,
    count: Number(r.count),
  }))

  const totalStorage = (totalPhotoSize._sum.fileSize || 0) + (totalVideoSize._sum.fileSize || 0)
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

async function AnalyticsContent() {
  const data = await getAnalyticsData()

  const summaryCards = [
    {
      title: "Total Media",
      value: data.summary.totalMedia.toLocaleString(),
      description: "Photos & videos",
      icon: Image,
    },
    {
      title: "Total Albums",
      value: data.summary.totalAlbums.toLocaleString(),
      description: "In gallery",
      icon: FolderOpen,
    },
    {
      title: "Total Storage",
      value: data.summary.totalStorage,
      description: "All media files",
      icon: HardDrive,
    },
    {
      title: "Photos (30d)",
      value: data.summary.recentPhotos.toLocaleString(),
      description: data.summary.photoGrowthPct >= 0
        ? `+${data.summary.photoGrowthPct}% vs prior 30d`
        : `${data.summary.photoGrowthPct}% vs prior 30d`,
      icon: Camera,
    },
    {
      title: "Videos (30d)",
      value: data.summary.recentVideos.toLocaleString(),
      description: "Added this month",
      icon: Video,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <AnalyticsCharts
        contentGrowth={data.contentGrowth}
        mediaTimeline={data.mediaTimeline}
        storageByAlbum={data.storageByAlbum}
        photoFormats={data.photoFormats}
        videoCodecs={data.videoCodecs}
      />
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Gallery insights and performance metrics</p>
      </div>

      <Suspense fallback={<AnalyticsLoading />}>
        <AnalyticsContent />
      </Suspense>
    </div>
  )
}
