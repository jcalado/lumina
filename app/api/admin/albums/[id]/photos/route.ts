import { NextRequest, NextResponse } from "next/server"
import { requireAlbumRead } from "@/lib/album-auth"
import { prisma } from "@/lib/prisma"
import { S3Service } from "@/lib/s3"

// GET /api/admin/albums/[id]/photos - Get all photos in an album
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAlbumRead(id)
    if (authResult instanceof NextResponse) {
      return authResult
    }

    // Verify album exists
    const album = await prisma.album.findUnique({
      where: { id },
      select: { id: true, name: true, path: true }
    })

    if (!album) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    const includeDescendants = request.nextUrl.searchParams.get("includeDescendants") === "true"

    if (includeDescendants) {
      // Find all descendant album IDs
      const descendantAlbums = await prisma.album.findMany({
        where: {
          path: { startsWith: album.path + "/" },
        },
        select: { id: true, name: true },
      })

      const allAlbumIds = [album.id, ...descendantAlbums.map((a) => a.id)]
      const albumNameMap = new Map<string, string>()
      albumNameMap.set(album.id, album.name)
      for (const a of descendantAlbums) {
        albumNameMap.set(a.id, a.name)
      }

      const s3 = new S3Service()

      const photos = await prisma.photo.findMany({
        where: { albumId: { in: allAlbumIds } },
        select: {
          id: true,
          albumId: true,
          filename: true,
          takenAt: true,
          thumbnails: {
            where: { size: "MEDIUM" },
            select: { s3Key: true },
            take: 1,
          },
        },
        orderBy: [{ takenAt: "asc" }, { filename: "asc" }],
      })

      // Group photos by album name
      const grouped: Record<string, Array<{
        id: string
        filename: string
        takenAt: string | null
        thumbnailUrl: string | null
      }>> = {}

      for (const photo of photos) {
        const albumName = albumNameMap.get(photo.albumId) || "Unknown"
        if (!grouped[albumName]) {
          grouped[albumName] = []
        }
        const s3Key = photo.thumbnails[0]?.s3Key
        grouped[albumName].push({
          id: photo.id,
          filename: photo.filename,
          takenAt: photo.takenAt?.toISOString() ?? null,
          thumbnailUrl: s3Key ? s3.getPublicUrl(s3Key) : null,
        })
      }

      return NextResponse.json({ photosByAlbum: grouped })
    }

    // Default: get photos from this album only
    const photos = await prisma.photo.findMany({
      where: { albumId: id },
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        fileSize: true,
        takenAt: true,
        createdAt: true,
        metadata: true
      },
      orderBy: [
        { takenAt: 'desc' },
        { filename: 'asc' }
      ]
    })

    return NextResponse.json({
      photos
    })

  } catch (error) {
    console.error("Error fetching album photos:", error)
    return NextResponse.json(
      { error: "Failed to fetch album photos" },
      { status: 500 }
    )
  }
}
