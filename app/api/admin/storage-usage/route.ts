import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { s3 } from '@/lib/s3'
import fs from 'fs/promises'
import path from 'path'

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

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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

    const totalSize = photos.reduce((sum: number, photo: { fileSize: number | null }) => sum + (photo.fileSize || 0), 0)
    const objectCount = photos.length

    return { totalSize, objectCount }
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
    console.log('[STORAGE USAGE] Starting storage usage calculation...')

    // Get local storage usage
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    let localStorageSize = 0
    let localFileCount = 0
    
    if (photosRoot) {
      try {
        console.log(`[STORAGE USAGE] Calculating local storage size for: ${photosRoot}`)
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
        console.log(`[STORAGE USAGE] Local storage: ${formatBytes(localStorageSize)}, Files: ${localFileCount}`)
      } catch (error) {
        console.error('[STORAGE USAGE] Error calculating local storage:', error)
      }
    }

    // Get S3 storage usage
    console.log('[STORAGE USAGE] Calculating S3 storage usage...')
    const s3Usage = await getS3StorageUsage()
    console.log(`[STORAGE USAGE] S3 storage: ${formatBytes(s3Usage.totalSize)}, Objects: ${s3Usage.objectCount}`)

    // Calculate percentages and differences
    const totalStorage = localStorageSize + s3Usage.totalSize
    const localPercentage = totalStorage > 0 ? (localStorageSize / totalStorage) * 100 : 0
    const s3Percentage = totalStorage > 0 ? (s3Usage.totalSize / totalStorage) * 100 : 0

    const response = {
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
