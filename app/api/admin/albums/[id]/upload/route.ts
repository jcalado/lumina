import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getBatchProcessingSize } from '@/lib/settings'
import AdmZip from 'adm-zip'
import crypto from 'crypto'

const SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB per file
const TEMP_DIR = path.join(process.cwd(), 'temp')

interface UploadProgress {
  uploadId: string
  totalFiles: number
  processedFiles: number
  currentFile: string
  errors: Array<{ filename: string; error: string }>
  completed: boolean
}

// In-memory progress tracking
const uploadProgress = new Map<string, UploadProgress>()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const albumId = params.id
    
    // Verify album exists
    const album = await prisma.album.findUnique({
      where: { id: albumId }
    })
    
    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const uploadType = formData.get('uploadType') as string // 'files' or 'zip'
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Generate unique upload ID
    const uploadId = crypto.randomUUID()
    
    // Initialize progress tracking
    uploadProgress.set(uploadId, {
      uploadId,
      totalFiles: files.length,
      processedFiles: 0,
      currentFile: '',
      errors: [],
      completed: false
    })

    // Process files asynchronously
    processUploadAsync(uploadId, albumId, album.path, files, uploadType)
    
    return NextResponse.json({ 
      success: true, 
      uploadId,
      message: `Started upload of ${files.length} file(s)`
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ 
      error: 'Failed to start upload', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')
    
    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID required' }, { status: 400 })
    }

    const progress = uploadProgress.get(uploadId)
    if (!progress) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    return NextResponse.json(progress)
  } catch (error) {
    console.error('Progress check error:', error)
    return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 })
  }
}

async function processUploadAsync(
  uploadId: string,
  albumId: string,
  albumPath: string,
  files: File[],
  uploadType: string
) {
  const progress = uploadProgress.get(uploadId)!
  
  try {
    // Ensure temp directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true })
    
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    if (!photosRoot) {
      throw new Error('PHOTOS_ROOT_PATH not configured')
    }
    
    const albumDir = path.join(photosRoot, albumPath)
    
    // Ensure album directory exists
    await fs.mkdir(albumDir, { recursive: true })

    let filesToProcess: { file: File; filename: string }[] = []

    if (uploadType === 'zip' && files.length === 1) {
      // Handle ZIP file
      progress.currentFile = 'Extracting ZIP file...'
      filesToProcess = await extractZipFile(files[0], albumDir)
      progress.totalFiles = filesToProcess.length
    } else {
      // Handle individual files
      filesToProcess = files.map(file => ({ file, filename: file.name }))
    }

    const batchSize = await getBatchProcessingSize()
    
    // Process files in batches
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async ({ file, filename }) => {
          try {
            progress.currentFile = filename
            await processFile(file, filename, albumDir, albumId, albumPath)
            progress.processedFiles++
          } catch (error) {
            console.error(`Error processing ${filename}:`, error)
            progress.errors.push({
              filename,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
            progress.processedFiles++
          }
        })
      )
    }

    // Clean up ZIP file if it was uploaded
    if (uploadType === 'zip' && files.length === 1) {
      try {
        const tempZipPath = path.join(TEMP_DIR, `${uploadId}.zip`)
        await fs.unlink(tempZipPath).catch(() => {}) // Ignore errors
      } catch (error) {
        console.error('Error cleaning up ZIP file:', error)
      }
    }

    progress.completed = true
    progress.currentFile = 'Upload completed'
    
    // Clean up progress after 5 minutes
    setTimeout(() => {
      uploadProgress.delete(uploadId)
    }, 5 * 60 * 1000)

  } catch (error) {
    console.error('Upload processing error:', error)
    progress.errors.push({
      filename: 'System',
      error: error instanceof Error ? error.message : 'Upload failed'
    })
    progress.completed = true
    progress.currentFile = 'Upload failed'
  }
}

async function extractZipFile(zipFile: File, albumDir: string): Promise<{ file: File; filename: string }[]> {
  const tempZipPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.zip`)
  
  // Write ZIP to temp file
  const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
  await fs.writeFile(tempZipPath, zipBuffer)
  
  const zip = new AdmZip(tempZipPath)
  const entries = zip.getEntries()
  
  const extractedFiles: { file: File; filename: string }[] = []
  
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const filename = path.basename(entry.entryName)
      const ext = path.extname(filename).toLowerCase()
      
      if (SUPPORTED_IMAGE_FORMATS.includes(ext)) {
        const fileBuffer = entry.getData()
        const file = new File([new Uint8Array(fileBuffer)], filename, {
          type: getMimeType(ext)
        })
        extractedFiles.push({ file, filename })
      }
    }
  }
  
  // Clean up temp ZIP file
  await fs.unlink(tempZipPath).catch(() => {})
  
  return extractedFiles
}

async function processFile(
  file: File,
  filename: string,
  albumDir: string,
  albumId: string,
  albumPath: string
) {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
  }

  // Validate file type
  const ext = path.extname(filename).toLowerCase()
  if (!SUPPORTED_IMAGE_FORMATS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`)
  }

  // Generate safe filename
  const safeFilename = sanitizeFilename(filename)
  const filePath = path.join(albumDir, safeFilename)
  
  // Check if file already exists
  try {
    await fs.access(filePath)
    throw new Error('File already exists')
  } catch (error) {
    // File doesn't exist, we can proceed
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  // Write file to disk
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filePath, fileBuffer)

  // Create database record (the sync process will handle S3 upload)
  await prisma.photo.create({
    data: {
      albumId,
      filename: safeFilename,
      originalPath: filePath,
      fileSize: file.size,
      s3Key: '', // Will be set during sync
      createdAt: new Date()
    }
  })
}

function sanitizeFilename(filename: string): string {
  // Remove path separators and other unsafe characters
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
