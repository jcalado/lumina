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
    console.log(`[DELETE LOCAL] Starting deletion process for album ID: ${id}`)

    // Get album details
    const album = await prisma.album.findUnique({
      where: { id },
      include: { photos: true }
    })

    if (!album) {
      console.log(`[DELETE LOCAL] Album not found: ${id}`)
      return NextResponse.json({ error: 'Album not found' }, { status: 404 })
    }

    console.log(`[DELETE LOCAL] Found album: ${album.name} (${album.path})`)
    console.log(`[DELETE LOCAL] localFilesSafeDelete: ${album.localFilesSafeDelete}`)
    console.log(`[DELETE LOCAL] Photos count: ${album.photos.length}`)

    // Safety check - only allow deletion if album is marked as safe
    if (!album.localFilesSafeDelete) {
      console.log(`[DELETE LOCAL] Album not marked as safe for deletion: ${album.name}`)
      return NextResponse.json(
        { error: 'Album is not marked as safe for local file deletion' },
        { status: 400 }
      )
    }

    // Delete local files
    const photosRoot = process.env.PHOTOS_ROOT_PATH || ''
    const albumPath = path.join(photosRoot, album.path)
    
    console.log(`[DELETE LOCAL] PHOTOS_ROOT_PATH: ${photosRoot}`)
    console.log(`[DELETE LOCAL] Full album path: ${albumPath}`)
    
    try {
      // Check if directory exists
      console.log(`[DELETE LOCAL] Checking if directory exists...`)
      await fs.access(albumPath)
      console.log(`[DELETE LOCAL] Directory exists, proceeding with deletion`)
      
      // Get directory stats before deletion
      const stats = await fs.stat(albumPath)
      console.log(`[DELETE LOCAL] Directory stats - isDirectory: ${stats.isDirectory()}`)
      
      // List contents before deletion for logging
      const contents = await fs.readdir(albumPath)
      console.log(`[DELETE LOCAL] Directory contains ${contents.length} items: ${contents.slice(0, 5).join(', ')}${contents.length > 5 ? '...' : ''}`)
      
      // Remove the entire album directory
      console.log(`[DELETE LOCAL] Removing directory: ${albumPath}`)
      await fs.rm(albumPath, { recursive: true, force: true })
      
      console.log(`[DELETE LOCAL] Successfully deleted local album directory: ${albumPath}`)
      
      // Verify deletion
      try {
        await fs.access(albumPath)
        console.log(`[DELETE LOCAL] WARNING: Directory still exists after deletion attempt`)
      } catch {
        console.log(`[DELETE LOCAL] Confirmed: Directory no longer exists`)
      }
      
    } catch (error) {
      console.error(`[DELETE LOCAL] Error deleting local directory ${albumPath}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json(
        { error: `Failed to delete local directory: ${errorMessage}` },
        { status: 500 }
      )
    }

    // Update album to reflect that local files have been deleted
    console.log(`[DELETE LOCAL] Updating album database record...`)
    await prisma.album.update({
      where: { id },
      data: {
        localFilesSafeDelete: false, // Reset the flag since files are now deleted
      }
    })

    console.log(`[DELETE LOCAL] Operation completed successfully for album: ${album.name}`)
    return NextResponse.json({ 
      success: true, 
      message: `Deleted local files for album: ${album.name}`,
      deletedPath: albumPath,
      itemsDeleted: await getDeletedItemsCount(albumPath)
    })
  } catch (error) {
    console.error('[DELETE LOCAL] Error in deletion process:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to delete local files: ${errorMessage}` },
      { status: 500 }
    )
  }
}

async function getDeletedItemsCount(deletedPath: string): Promise<number> {
  // This is just for logging - try to get a count of what we deleted
  // Since the directory is already deleted, we can't get exact count
  // but we can return a placeholder
  return 0
}
