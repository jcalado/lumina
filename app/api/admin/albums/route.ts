import { NextRequest, NextResponse } from "next/server"
import { requireAuthenticated } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { getAccessibleAlbumIds, getAlbumPermissions } from "@/lib/album-auth"

// GET /api/admin/albums - List all albums with admin details
export async function GET() {
  const authResult = await requireAuthenticated()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const accessibleIds = await getAccessibleAlbumIds(authResult.user.id, authResult.user.role)
    const permissions = await getAlbumPermissions(authResult.user.id, authResult.user.role)

    const albums = await prisma.album.findMany({
      where: accessibleIds !== null ? { id: { in: accessibleIds } } : undefined,
      include: {
        _count: {
          select: { photos: true, videos: true }
        }
      },
      orderBy: [
        { displayOrder: "asc" },
        { name: "asc" },
        { createdAt: "desc" }
      ]
    })

    const formattedAlbums = albums.map((album: any) => ({
      ...album,
      photoCount: album._count.photos,
      videoCount: album._count.videos,
    }))

    return NextResponse.json({ albums: formattedAlbums, permissions })
  } catch (error) {
    console.error("Error fetching albums:", error)
    return NextResponse.json(
      { error: "Failed to fetch albums" },
      { status: 500 }
    )
  }
}
