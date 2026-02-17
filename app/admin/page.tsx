import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FolderOpen, Image, HardDrive, Eye, Video, Settings, Activity, Upload } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getAllHealthChecks, type HealthCheckResult } from "@/lib/health"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

interface StorageUsage {
  remote: {
    size: number
    sizeFormatted: string
    objectCount: number
  }
  lastUpdated: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

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

    const photoSize = photos.reduce((sum, p) => sum + (p.fileSize || 0), 0)
    const videoSize = videos.reduce((sum, v) => sum + (v.fileSize || 0), 0)

    return {
      totalSize: photoSize + videoSize,
      objectCount: photos.length + videos.length,
    }
  } catch (error) {
    console.error('Error calculating S3 storage usage:', error)
    return { totalSize: 0, objectCount: 0 }
  }
}

async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    const s3Usage = await getS3StorageUsage()

    return {
      remote: {
        size: s3Usage.totalSize,
        sizeFormatted: formatBytes(s3Usage.totalSize),
        objectCount: s3Usage.objectCount,
      },
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    console.error('Error getting storage usage:', error)
    return null
  }
}

async function getDashboardStats() {
  const [albumCount, photoCount, videoCount, publicAlbumCount, storageUsage] = await Promise.all([
    prisma.album.count(),
    prisma.photo.count(),
    prisma.video.count(),
    prisma.album.count({ where: { status: "PUBLIC", enabled: true } }),
    getStorageUsage(),
  ])

  return { albumCount, photoCount, videoCount, publicAlbumCount, storageUsage }
}

function DashboardStatsLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 bg-muted rounded w-20" />
            <div className="h-4 w-4 bg-muted rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-8 bg-muted rounded w-16 mb-2" />
            <div className="h-3 bg-muted rounded w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function DashboardStats() {
  const stats = await getDashboardStats()
  const totalMedia = stats.photoCount + stats.videoCount

  const statCards = [
    {
      title: "Total Albums",
      value: stats.albumCount,
      description: "All albums in system",
      icon: FolderOpen,
    },
    {
      title: "Public Albums",
      value: stats.publicAlbumCount,
      description: "Visible to visitors",
      icon: Eye,
    },
    {
      title: "Total Media",
      value: totalMedia.toLocaleString(),
      description: `${stats.photoCount.toLocaleString()} photos, ${stats.videoCount.toLocaleString()} videos`,
      icon: Image,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        )
      })}

      {/* Storage Usage Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {stats.storageUsage ? (
            <div className="space-y-1">
              <div className="text-2xl font-bold">{stats.storageUsage.remote.sizeFormatted}</div>
              <p className="text-xs text-muted-foreground">
                {stats.storageUsage.remote.objectCount.toLocaleString()} objects in S3
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">Loading storage data...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusDot({ status }: { status: HealthCheckResult['status'] }) {
  const colors = {
    online: 'bg-green-500',
    degraded: 'bg-yellow-500',
    offline: 'bg-red-500',
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />
}

function StatusLabel({ result }: { result: HealthCheckResult }) {
  const labels = { online: 'Online', degraded: 'Degraded', offline: 'Offline' }
  const colors = {
    online: 'text-green-600 dark:text-green-400',
    degraded: 'text-yellow-600 dark:text-yellow-400',
    offline: 'text-red-600 dark:text-red-400',
  }
  return (
    <div className="flex items-center gap-2">
      <StatusDot status={result.status} />
      <span className={`text-sm font-medium ${colors[result.status]}`}>
        {labels[result.status]}
      </span>
      {result.latencyMs !== undefined && result.status !== 'offline' && (
        <span className="text-xs text-muted-foreground">({result.latencyMs}ms)</span>
      )}
    </div>
  )
}

function SystemStatusLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Status</CardTitle>
        <CardDescription>Current system health</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between animate-pulse">
              <div className="h-4 bg-muted rounded w-28" />
              <div className="h-4 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

async function SystemStatus() {
  const health = await getAllHealthChecks()

  const services = [
    { name: 'Database', result: health.database },
    { name: 'S3 Storage', result: health.s3 },
    { name: 'Redis', result: health.redis },
    { name: 'Background Jobs', result: health.jobs },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Status</CardTitle>
        <CardDescription>Current system health</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{svc.name}</span>
              <StatusLabel result={svc.result} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickActions() {
  const actions = [
    { label: 'Upload Photos', href: '/admin/albums', icon: Upload },
    { label: 'Manage Albums', href: '/admin/albums', icon: FolderOpen },
    { label: 'View Jobs', href: '/admin/jobs', icon: Activity },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common admin tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Button key={action.label} variant="outline" className="h-auto py-3 flex flex-col gap-1" asChild>
                <Link href={action.href}>
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{action.label}</span>
                </Link>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function RecentActivityLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest album updates</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between animate-pulse">
              <div className="h-4 bg-muted rounded w-40" />
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

async function RecentActivity() {
  const [recentAlbums, last24hPhotos, last24hVideos] = await Promise.all([
    prisma.album.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, name: true, updatedAt: true },
    }),
    prisma.photo.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.video.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          {last24hPhotos + last24hVideos > 0
            ? `${last24hPhotos + last24hVideos} new media in the last 24h`
            : 'No new media in the last 24h'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentAlbums.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Updated Albums</h4>
              <div className="space-y-2">
                {recentAlbums.map((album) => (
                  <div key={album.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate max-w-[200px]">{album.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(album.updatedAt, { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentAlbums.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardStatsLoading />}>
        <DashboardStats />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<SystemStatusLoading />}>
          <SystemStatus />
        </Suspense>

        <QuickActions />

        <Suspense fallback={<RecentActivityLoading />}>
          <RecentActivity />
        </Suspense>
      </div>
    </div>
  )
}
