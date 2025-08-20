import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FolderOpen, Image, Clock, Eye, RefreshCw } from "lucide-react"
import { prisma } from "@/lib/prisma"
import Link from "next/link"

async function getDashboardStats() {
  const [albumCount, photoCount, publicAlbumCount, syncJobs] = await Promise.all([
    prisma.album.count(),
    prisma.photo.count(),
    prisma.album.count({ where: { status: "PUBLIC", enabled: true } }),
    prisma.syncJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ])

  return {
    albumCount,
    photoCount,
    publicAlbumCount,
    syncJobs
  }
}

function DashboardStatsLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 w-4 bg-gray-200 rounded"></div>
          </CardHeader>
          <CardContent>
            <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function DashboardStats() {
  const stats = await getDashboardStats()

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
      title: "Total Photos",
      value: stats.photoCount.toLocaleString(),
      description: "Across all albums",
      icon: Image,
    },
    {
      title: "Recent Syncs",
      value: stats.syncJobs.length,
      description: "Last 5 sync jobs",
      icon: Clock,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex space-x-2">
          <Button asChild>
            <Link href="/admin/sync">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Management
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<DashboardStatsLoading />}>
        <DashboardStats />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common administrative tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
              <Link href="/admin/albums">
                <FolderOpen className="h-4 w-4 mr-2" />
                Manage Albums
              </Link>
            </Button>
            <Button asChild className="w-full justify-start border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
              <Link href="/admin/sync">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Management
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current system health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Database</span>
                <span className="text-sm font-medium text-green-600">Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Storage</span>
                <span className="text-sm font-medium text-green-600">Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Background Jobs</span>
                <span className="text-sm font-medium text-green-600">Running</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
