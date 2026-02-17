import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { requireAlbumAccess } from '@/lib/album-auth'
import { prisma } from '@/lib/prisma'
import { generateUniqueSlug } from '@/lib/slugs'

export async function POST(request: NextRequest) {
  try {
    const { name, description, parentPath } = await request.json()

    // If creating under a parent, check can_create_subalbums on the parent.
    // Otherwise, require admin/superadmin.
    if (parentPath) {
      const parentAlbum = await prisma.album.findUnique({
        where: { path: parentPath },
        select: { id: true },
      })

      if (!parentAlbum) {
        return NextResponse.json(
          { error: 'Parent album not found' },
          { status: 404 }
        )
      }

      const authResult = await requireAlbumAccess(parentAlbum.id, 'can_create_subalbums')
      if (authResult instanceof NextResponse) {
        return authResult
      }
    } else {
      const authResult = await requireAdmin()
      if (authResult instanceof NextResponse) {
        return authResult
      }
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Album name is required' },
        { status: 400 }
      )
    }

    // Sanitize album name
    const sanitizedName = name.trim().replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ')

    // Build album path
    const albumPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName

    console.log(`[CREATE ALBUM] Creating album: ${albumPath}`)

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
