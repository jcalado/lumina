import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { generateUniqueSlug } from '@/lib/slugs'
import fs from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { name, description, parentPath } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Album name is required' },
        { status: 400 }
      )
    }

    // Sanitize album name for filesystem
    const sanitizedName = name.trim().replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ')
    
    // Build album path
    const albumPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName
    
    console.log(`[CREATE ALBUM] Creating album: ${albumPath}`)
    console.log(`[CREATE ALBUM] Name: ${name}`)
    console.log(`[CREATE ALBUM] Parent path: ${parentPath || 'root'}`)

    // Check if album already exists in database
    const existingAlbum = await prisma.album.findUnique({
      where: { path: albumPath }
    })

    if (existingAlbum) {
      return NextResponse.json(
        { error: 'An album with this path already exists' },
        { status: 400 }
      )
    }

    // Create local filesystem directory
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    if (!photosRoot) {
      return NextResponse.json(
        { error: 'PHOTOS_ROOT_PATH environment variable not configured' },
        { status: 500 }
      )
    }

    const fullLocalPath = path.join(photosRoot, albumPath)
    
    try {
      // Check if directory already exists
      try {
        await fs.access(fullLocalPath)
        return NextResponse.json(
          { error: 'Directory already exists on filesystem' },
          { status: 400 }
        )
      } catch {
        // Directory doesn't exist, which is good - we can create it
      }

      // Create the directory (and any necessary parent directories)
      await fs.mkdir(fullLocalPath, { recursive: true })
      console.log(`[CREATE ALBUM] Created directory: ${fullLocalPath}`)

      // Verify directory was created
      const stats = await fs.stat(fullLocalPath)
      if (!stats.isDirectory()) {
        throw new Error('Created path is not a directory')
      }

      // Optionally create a project.md file for the album description
      if (description && description.trim()) {
        const projectPath = path.join(fullLocalPath, 'project.md')
        await fs.writeFile(projectPath, description.trim(), 'utf-8')
        console.log(`[CREATE ALBUM] Created project.md file`)
      }

    } catch (error) {
      console.error(`[CREATE ALBUM] Error creating directory:`, error)
      return NextResponse.json(
        { error: `Failed to create album directory: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Generate unique slug for the album
    const slug = await generateUniqueSlug(sanitizedName)

    // Create album in database
    const album = await prisma.album.create({
      data: {
        path: albumPath,
        slug: slug,
        name: sanitizedName,
        description: description?.trim() || null,
        status: 'PUBLIC',
        enabled: true,
        syncedToS3: false,
        localFilesSafeDelete: false,
      }
    })

    console.log(`[CREATE ALBUM] Created album in database with ID: ${album.id}`)

    return NextResponse.json({
      success: true,
      album: {
        id: album.id,
        path: album.path,
        slug: album.slug,
        name: album.name,
        description: album.description,
        localPath: fullLocalPath
      },
      message: `Album "${sanitizedName}" created successfully`
    })

  } catch (error) {
    console.error('[CREATE ALBUM] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to create album: ${errorMessage}` },
      { status: 500 }
    )
  }
}
