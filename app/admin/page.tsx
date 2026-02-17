import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FolderOpen, Image, HardDrive, Eye, Video, Settings, Activity, Upload, ArrowRight, Database, Cloud, Server, Cog } from "lucide-react"
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

const statusStyles = {
  online: {
    tile: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  },
  degraded: {
    tile: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
    iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400',
    dot: 'bg-amber-500',
    label: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
  offline: {
    tile: 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800',
    iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-400',
    dot: 'bg-rose-500',
    label: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
  },
}

const statusLabels = { online: 'Online', degraded: 'Degraded', offline: 'Offline' }

function SystemStatusLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Status</CardTitle>
        <CardDescription>Current system health</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-3 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 bg-muted rounded-md" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-3 bg-muted rounded w-14" />
                </div>
              </div>
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
    { name: 'Database', icon: Database, result: health.database },
    { name: 'S3 Storage', icon: Cloud, result: health.s3 },
    { name: 'Redis', icon: Server, result: health.redis },
    { name: 'Jobs', icon: Cog, result: health.jobs },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Status</CardTitle>
        <CardDescription>Current system health</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {services.map((svc) => {
            const Icon = svc.icon
            const style = statusStyles[svc.result.status]
            return (
              <div key={svc.name} className={`rounded-lg border p-3 ${style.tile}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 rounded-md p-2 ${style.iconBg}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight text-foreground">{svc.name}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
                      <span className={`text-xs font-medium ${style.label}`}>
                        {statusLabels[svc.result.status]}
                      </span>
                    </div>
                    {svc.result.latencyMs !== undefined && svc.result.status !== 'offline' && (
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{svc.result.latencyMs}ms</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickActions() {
  const actions = [
    {
      label: 'Upload Photos',
      description: 'Add new photos to albums',
      href: '/admin/albums',
      icon: Upload,
      iconBg: 'bg-sky-100 dark:bg-sky-900',
      iconColor: 'text-sky-600 dark:text-sky-400',
      hoverBorder: 'hover:border-sky-300 dark:hover:border-sky-700',
      hoverBg: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/20',
    },
    {
      label: 'Manage Albums',
      description: 'Organize and edit albums',
      href: '/admin/albums',
      icon: FolderOpen,
      iconBg: 'bg-amber-100 dark:bg-amber-900',
      iconColor: 'text-amber-600 dark:text-amber-400',
      hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-700',
      hoverBg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20',
    },
    {
      label: 'View Jobs',
      description: 'Monitor background tasks',
      href: '/admin/jobs',
      icon: Activity,
      iconBg: 'bg-violet-100 dark:bg-violet-900',
      iconColor: 'text-violet-600 dark:text-violet-400',
      hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700',
      hoverBg: 'hover:bg-violet-50/50 dark:hover:bg-violet-950/20',
    },
    {
      label: 'Settings',
      description: 'Configure your gallery',
      href: '/admin/settings',
      icon: Settings,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
      hoverBorder: 'hover:border-slate-300 dark:hover:border-slate-600',
      hoverBg: 'hover:bg-slate-50/50 dark:hover:bg-slate-950/20',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common admin tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                href={action.href}
                className={`group relative rounded-lg border p-3 transition-all duration-150 ${action.hoverBorder} ${action.hoverBg}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 rounded-md p-2 ${action.iconBg} ${action.iconColor}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{action.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/0 transition-all duration-150 group-hover:text-muted-foreground group-hover:translate-x-0.5" />
              </Link>
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
