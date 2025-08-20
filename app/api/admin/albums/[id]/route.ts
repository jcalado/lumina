import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateAlbumSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  enabled: z.boolean().optional(),
})

// PUT /api/admin/albums/[id] - Update album settings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await params
    const body = await request.json()
    const validatedData = updateAlbumSchema.parse(body)

    const album = await prisma.album.update({
      where: { id },
      data: validatedData,
      include: {
        _count: {
          select: { photos: true }
        }
      }
    })

    return NextResponse.json({ album })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error updating album:", error)
    return NextResponse.json(
      { error: "Failed to update album" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/albums/[id] - Delete album
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id } = await params
    await prisma.album.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting album:", error)
    return NextResponse.json(
      { error: "Failed to delete album" },
      { status: 500 }
    )
  }
}
