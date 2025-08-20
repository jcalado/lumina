import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import fs from 'fs/promises'
import path from 'path'

interface Params {
  id: string
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await context.params

    // Get album details
    const album = await prisma.album.findUnique({
      where: { id },
      include: { photos: true }
    })

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    // Safety check - only allow deletion if album is marked as safe
    if (!album.localFilesSafeDelete) {
      return NextResponse.json(
        { error: 'Album is not marked as safe for local file deletion' },
        { status: 400 }
      )
    }

    // Delete local files
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    const albumPath = path.join(photosRoot, album.path)
    
    try {
      // Check if directory exists
      await fs.access(albumPath)
      
      // Remove the entire album directory
      await fs.rm(albumPath, { recursive: true, force: true })
      
      console.log(`Deleted local album directory: ${albumPath}`)
    } catch (error) {
      console.error(`Error deleting local directory ${albumPath}:`, error)
      // Continue even if local deletion fails
    }

    // Update album to reflect that local files have been deleted
    await prisma.album.update({
      where: { id },
      data: {
        localFilesSafeDelete: false, // Reset the flag since files are now deleted
      }
    })

    return NextResponse.json({ 
      success: true, 
      message: `Deleted local files for album: ${album.name}`,
      deletedPath: albumPath
    })
  } catch (error) {
    console.error('Error deleting local files:', error)
    return NextResponse.json(
      { error: 'Failed to delete local files' },
      { status: 500 }
    )
  }
}
