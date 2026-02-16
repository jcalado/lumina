import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FolderOpen, Image, HardDrive, Cloud, Eye, Video, RefreshCw, Settings, Activity, FolderSync, Clock } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getAllHealthChecks, type HealthCheckResult } from "@/lib/health"
import { formatDistanceToNow } from "date-fns"
import fs from 'fs/promises'
import path from 'path'
import Link from "next/link"

interface StorageUsage {
  local: {
    size: number
    sizeFormatted: string
    fileCount: number
    percentage: number
  }
  remote: {
    size: number
    sizeFormatted: string
    objectCount: number
    percentage: number
  }
  total: {
    size: number
    sizeFormatted: string
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

async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    let totalSize = 0
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath)
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath)
        totalSize += stat.size
      }
    }
    return totalSize
  } catch (error) {
    console.error(`Error calculating directory size for ${dirPath}:`, error)
    return 0
  }
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
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    let localStorageSize = 0
    let localFileCount = 0

    if (photosRoot) {
      try {
        localStorageSize = await getDirectorySize(photosRoot)

        const countFiles = async (dirPath: string): Promise<number> => {
          let count = 0
          try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true })
            for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name)
              if (entry.isDirectory()) {
                count += await countFiles(fullPath)
              } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|bmp|webp|tiff|mp4|mov|avi|mkv|webm)$/i.test(entry.name)) {
                count++
              }
            }
          } catch (error) {
            console.error(`Error counting files in ${dirPath}:`, error)
          }
          return count
        }

        localFileCount = await countFiles(photosRoot)
      } catch (error) {
        console.error('Error calculating local storage:', error)
      }
    }

    const s3Usage = await getS3StorageUsage()
    const totalStorage = localStorageSize + s3Usage.totalSize
    const localPercentage = totalStorage > 0 ? (localStorageSize / totalStorage) * 100 : 0
    const s3Percentage = totalStorage > 0 ? (s3Usage.totalSize / totalStorage) * 100 : 0

    return {
      local: {
        size: localStorageSize,
        sizeFormatted: formatBytes(localStorageSize),
        fileCount: localFileCount,
        percentage: Math.round(localPercentage * 100) / 100,
      },
      remote: {
        size: s3Usage.totalSize,
        sizeFormatted: formatBytes(s3Usage.totalSize),
        objectCount: s3Usage.objectCount,
        percentage: Math.round(s3Percentage * 100) / 100,
      },
      total: {
        size: totalStorage,
        sizeFormatted: formatBytes(totalStorage),
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
            <div className="space-y-3">
              <div className="text-2xl font-bold">{stats.storageUsage.total.sizeFormatted}</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    <span>Local</span>
                  </div>
                  <span className="font-medium">{stats.storageUsage.local.sizeFormatted}</span>
                </div>
                <Progress value={stats.storageUsage.local.percentage} className="h-1" />
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <Cloud className="h-3 w-3" />
                    <span>Remote</span>
                  </div>
                  <span className="font-medium">{stats.storageUsage.remote.sizeFormatted}</span>
                </div>
                <Progress value={stats.storageUsage.remote.percentage} className="h-1" />
              </div>
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
    { label: 'Run Sync', href: '/admin/sync', icon: FolderSync },
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
              <Button key={action.href} variant="outline" className="h-auto py-3 flex flex-col gap-1" asChild>
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
        <CardDescription>Latest sync jobs and album updates</CardDescription>
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
  const [recentJobs, recentAlbums, last24hPhotos, last24hVideos] = await Promise.all([
    prisma.syncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
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

  const jobStatusColors: Record<string, string> = {
    COMPLETED: 'text-green-600 dark:text-green-400',
    RUNNING: 'text-blue-600 dark:text-blue-400',
    PENDING: 'text-yellow-600 dark:text-yellow-400',
    FAILED: 'text-red-600 dark:text-red-400',
    CANCELLED: 'text-muted-foreground',
  }

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
          {recentJobs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sync Jobs</h4>
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        {job.type} sync
                        {job.filesProcessed > 0 && ` (${job.filesProcessed} files)`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${jobStatusColors[job.status] || 'text-muted-foreground'}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {recentJobs.length === 0 && recentAlbums.length === 0 && (
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
