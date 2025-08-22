import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getBatchProcessingSize } from '@/lib/settings'
import AdmZip from 'adm-zip'
import crypto from 'crypto'

const SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB per file
const MAX_TOTAL_SIZE = 500 * 1024 * 1024 // 500MB total
const TEMP_DIR = path.join(process.cwd(), 'temp')

interface FileProgress {
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
  size: number
}

interface UploadProgress {
  uploadId: string
  totalFiles: number
  processedFiles: number
  currentBatch: number
  totalBatches: number
  files: FileProgress[]
  errors: Array<{ filename: string; error: string }>
  completed: boolean
  phase: 'validating' | 'extracting' | 'uploading' | 'completed' | 'error'
}

// In-memory progress tracking
const uploadProgress = new Map<string, UploadProgress>()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const albumId = id
    
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

    // Validate total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ 
        error: `Total upload size too large: ${Math.round(totalSize / 1024 / 1024)}MB. Maximum: ${MAX_TOTAL_SIZE / 1024 / 1024}MB` 
      }, { status: 400 })
    }

    // Validate individual files
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ 
          error: `File "${file.name}" is too large: ${Math.round(file.size / 1024 / 1024)}MB. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        }, { status: 400 })
      }
    }

    // Generate unique upload ID
    const uploadId = crypto.randomUUID()
    
    // Initialize progress tracking
    uploadProgress.set(uploadId, {
      uploadId,
      totalFiles: 0, // Will be updated after processing
      processedFiles: 0,
      currentBatch: 0,
      totalBatches: 0,
      files: [],
      errors: [],
      completed: false,
      phase: 'validating'
    })

    // Process files asynchronously
    processUploadAsync(uploadId, albumId, album.path, files, uploadType)
    
    return NextResponse.json({ 
      success: true, 
      uploadId,
      message: `Started processing ${files.length} file(s)`
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
  { params }: { params: Promise<{ id: string }> }
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

    let filesToProcess: { filename: string; buffer: Buffer; size: number }[] = []

    if (uploadType === 'zip' && files.length === 1) {
      // Handle ZIP file
      progress.phase = 'extracting'
      console.log(`[UPLOAD] Extracting ZIP file: ${files[0].name}`)
      
      try {
        filesToProcess = await extractZipFile(files[0])
        console.log(`[UPLOAD] Extracted ${filesToProcess.length} files from ZIP`)
      } catch (error) {
        console.error('[UPLOAD] ZIP extraction failed:', error)
        throw new Error(`ZIP extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
      
      if (filesToProcess.length === 0) {
        throw new Error('No valid image files found in ZIP archive')
      }
    } else {
      // Handle individual files
      progress.phase = 'validating'
      console.log(`[UPLOAD] Processing ${files.length} individual files`)
      
      for (const file of files) {
        const ext = path.extname(file.name).toLowerCase()
        if (!SUPPORTED_IMAGE_FORMATS.includes(ext)) {
          progress.errors.push({
            filename: file.name,
            error: `Unsupported file format: ${ext}`
          })
          continue
        }
        
        const buffer = Buffer.from(await file.arrayBuffer())
        filesToProcess.push({
          filename: file.name,
          buffer,
          size: file.size
        })
      }
    }

    // Initialize file progress tracking
    progress.totalFiles = filesToProcess.length
    progress.files = filesToProcess.map(file => ({
      filename: file.filename,
      status: 'pending',
      size: file.size
    }))

    const batchSize = await getBatchProcessingSize()
    progress.totalBatches = Math.ceil(filesToProcess.length / batchSize)
    progress.phase = 'uploading'
    
    console.log(`[UPLOAD] Processing ${filesToProcess.length} files in ${progress.totalBatches} batches of size ${batchSize}`)

    // Process files in parallel batches
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize)
      progress.currentBatch = Math.floor(i / batchSize) + 1
      
      console.log(`[UPLOAD] Processing batch ${progress.currentBatch}/${progress.totalBatches} (${batch.length} files)`)

      await Promise.all(
        batch.map(async ({ filename, buffer, size }) => {
          const fileProgressIndex = progress.files.findIndex(f => f.filename === filename)
          if (fileProgressIndex !== -1) {
            progress.files[fileProgressIndex].status = 'processing'
          }
          
          try {
            await processFileBuffer(filename, buffer, size, albumDir, albumId, albumPath)
            
            if (fileProgressIndex !== -1) {
              progress.files[fileProgressIndex].status = 'completed'
            }
            progress.processedFiles++
            console.log(`[UPLOAD] Completed: ${filename} (${progress.processedFiles}/${progress.totalFiles})`)
          } catch (error) {
            console.error(`[UPLOAD] Error processing ${filename}:`, error)
            
            if (fileProgressIndex !== -1) {
              progress.files[fileProgressIndex].status = 'error'
              progress.files[fileProgressIndex].error = error instanceof Error ? error.message : 'Unknown error'
            }
            
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
    progress.phase = 'completed'
    
    const successCount = progress.processedFiles - progress.errors.length
    console.log(`[UPLOAD] Upload completed: ${successCount}/${progress.totalFiles} files successful, ${progress.errors.length} errors`)
    
    // Clean up progress after 10 minutes
    setTimeout(() => {
      uploadProgress.delete(uploadId)
    }, 10 * 60 * 1000)

  } catch (error) {
    console.error('Upload processing error:', error)
    progress.errors.push({
      filename: 'System',
      error: error instanceof Error ? error.message : 'Upload failed'
    })
    progress.completed = true
    progress.phase = 'error'
  }
}

async function extractZipFile(zipFile: File): Promise<{ filename: string; buffer: Buffer; size: number }[]> {
  const tempZipPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.zip`)
  
  console.log(`[UPLOAD] Writing ZIP to temp file: ${tempZipPath}`)
  
  // Write ZIP to temp file
  const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
  await fs.writeFile(tempZipPath, zipBuffer)
  
  console.log(`[UPLOAD] ZIP file written, size: ${zipBuffer.length} bytes`)
  
  const zip = new AdmZip(tempZipPath)
  const entries = zip.getEntries()
  
  console.log(`[UPLOAD] ZIP contains ${entries.length} entries`)
  
  const extractedFiles: { filename: string; buffer: Buffer; size: number }[] = []
  
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const entryName = entry.entryName
      const filename = path.basename(entryName)
      const ext = path.extname(filename).toLowerCase()
      
      console.log(`[UPLOAD] Processing ZIP entry: ${entryName} -> ${filename} (${ext})`)
      
      if (SUPPORTED_IMAGE_FORMATS.includes(ext)) {
        try {
          const fileBuffer = entry.getData()
          console.log(`[UPLOAD] Extracted file: ${filename}, size: ${fileBuffer.length} bytes`)
          
          extractedFiles.push({
            filename: sanitizeFilename(filename),
            buffer: fileBuffer,
            size: fileBuffer.length
          })
        } catch (error) {
          console.error(`[UPLOAD] Error extracting ${filename}:`, error)
        }
      } else {
        console.log(`[UPLOAD] Skipping unsupported file: ${filename} (${ext})`)
      }
    }
  }
  
  console.log(`[UPLOAD] Successfully extracted ${extractedFiles.length} image files from ZIP`)
  
  // Clean up temp ZIP file
  await fs.unlink(tempZipPath).catch((error) => {
    console.error('Error cleaning up temp ZIP file:', error)
  })
  
  return extractedFiles
}

async function processFileBuffer(
  filename: string,
  buffer: Buffer,
  size: number,
  albumDir: string,
  albumId: string,
  albumPath: string
) {
  // Validate file size
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
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
  await fs.writeFile(filePath, buffer)

  // Create database record (the sync process will handle S3 upload)
  await prisma.photo.create({
    data: {
      albumId,
      filename: safeFilename,
      originalPath: filePath,
      fileSize: size,
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
