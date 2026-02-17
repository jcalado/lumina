import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateAlbumSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["PUBLIC", "PRIVATE"]),
  enabled: z.boolean(),
})

// GET /api/admin/albums - List all albums with admin details
export async function GET() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const albums = await prisma.album.findMany({
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

    return NextResponse.json({ albums: formattedAlbums })
  } catch (error) {
    console.error("Error fetching albums:", error)
    return NextResponse.json(
      { error: "Failed to fetch albums" },
      { status: 500 }
    )
  }
}
