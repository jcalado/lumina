import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

// GET /api/admin/albums/[id]/photos - Get all photos in an album
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await params

    // Verify album exists
    const album = await prisma.album.findUnique({
      where: { id },
      select: { id: true, name: true }
    })

    if (!album) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    // Get all photos in the album
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
