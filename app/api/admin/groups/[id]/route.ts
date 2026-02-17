import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  albumId: z.string().min(1).optional(),
  canUpload: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  canCreateSubalbums: z.boolean().optional(),
})

interface Params {
  id: string
}

// GET /api/admin/groups/[id] - Get group detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  try {
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        album: { select: { id: true, name: true, path: true } },
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true, role: true },
            },
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error("Error fetching group:", error)
    return NextResponse.json(
      { error: "Failed to fetch group" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/groups/[id] - Update group
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  try {
    const body = await request.json()
    const data = updateGroupSchema.parse(body)

    // If albumId is being changed, verify the new album exists
    if (data.albumId) {
      const album = await prisma.album.findUnique({
        where: { id: data.albumId },
        select: { id: true },
      })
      if (!album) {
        return NextResponse.json(
          { error: "Album not found" },
          { status: 404 }
        )
      }
    }

    const group = await prisma.group.update({
      where: { id },
      data,
      include: {
        album: { select: { id: true, name: true, path: true } },
        _count: { select: { members: true } },
      },
    })

    return NextResponse.json({ group })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    console.error("Error updating group:", error)
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/groups/[id] - Delete group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  try {
    await prisma.group.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting group:", error)
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    )
  }
}
