import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FolderOpen, Image, HardDrive, Cloud, Eye, RefreshCw } from "lucide-react"
import { prisma } from "@/lib/prisma"
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

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper function to get directory size
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

// Helper function to get S3 storage usage
async function getS3StorageUsage(): Promise<{ totalSize: number; objectCount: number }> {
  try {
    // Get all photos from database to calculate S3 usage
    const photos = await prisma.photo.findMany({
      select: {
        fileSize: true,
        s3Key: true
      },
      where: {
        s3Key: { not: '' }
      }
    })

    const totalSize = photos.reduce((sum: number, photo) => sum + (photo.fileSize || 0), 0)
    const objectCount = photos.length

    return { totalSize, objectCount }
  } catch (error) {
    console.error('Error calculating S3 storage usage:', error)
    return { totalSize: 0, objectCount: 0 }
  }
}

async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    // Get local storage usage
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    let localStorageSize = 0
    let localFileCount = 0
    
    if (photosRoot) {
      try {
        localStorageSize = await getDirectorySize(photosRoot)
        
        // Count local files
        const countFiles = async (dirPath: string): Promise<number> => {
          let count = 0
          try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true })
            
            for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name)
              
              if (entry.isDirectory()) {
                count += await countFiles(fullPath)
              } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|bmp|webp|tiff)$/i.test(entry.name)) {
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

    // Get S3 storage usage
    const s3Usage = await getS3StorageUsage()

    // Calculate percentages and differences
    const totalStorage = localStorageSize + s3Usage.totalSize
    const localPercentage = totalStorage > 0 ? (localStorageSize / totalStorage) * 100 : 0
    const s3Percentage = totalStorage > 0 ? (s3Usage.totalSize / totalStorage) * 100 : 0

    return {
      local: {
        size: localStorageSize,
        sizeFormatted: formatBytes(localStorageSize),
        fileCount: localFileCount,
        percentage: Math.round(localPercentage * 100) / 100
      },
      remote: {
        size: s3Usage.totalSize,
        sizeFormatted: formatBytes(s3Usage.totalSize),
        objectCount: s3Usage.objectCount,
        percentage: Math.round(s3Percentage * 100) / 100
      },
      total: {
        size: totalStorage,
        sizeFormatted: formatBytes(totalStorage)
      },
      lastUpdated: new Date().toISOString()
    }
  } catch (error) {
    console.error('Error getting storage usage:', error)
    return null
  }
}

async function getDashboardStats() {
  const [albumCount, photoCount, publicAlbumCount, storageUsage] = await Promise.all([
    prisma.album.count(),
    prisma.photo.count(),
    prisma.album.count({ where: { status: "PUBLIC", enabled: true } }),
    getStorageUsage()
  ])

  return {
    albumCount,
    photoCount,
    publicAlbumCount,
    storageUsage
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
            {i === 3 ? (
              // Storage card loading with progress bars
              <div className="space-y-2">
                <div className="h-2 bg-gray-200 rounded w-full"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </div>
            ) : (
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function DashboardStats() {
  const stats = await getDashboardStats()

  const baseStatCards = [
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
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {baseStatCards.map((stat) => {
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
      
      {/* Storage Usage Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Storage Usage
          </CardTitle>
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
              <p className="text-xs text-muted-foreground">
                Loading storage data...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
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
