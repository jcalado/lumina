import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  albumIds: z.array(z.string().min(1)).min(1).optional(),
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
        albums: { include: { album: { select: { id: true, name: true, path: true } } } },
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

    // If albumIds are being changed, verify all albums exist
    if (data.albumIds) {
      const albums = await prisma.album.findMany({
        where: { id: { in: data.albumIds } },
        select: { id: true },
      })
      if (albums.length !== data.albumIds.length) {
        return NextResponse.json(
          { error: "One or more albums not found" },
          { status: 404 }
        )
      }
    }

    const { albumIds, ...groupData } = data

    const group = await prisma.$transaction(async (tx) => {
      // Replace album associations if provided
      if (albumIds) {
        await tx.groupAlbum.deleteMany({ where: { groupId: id } })
        await tx.groupAlbum.createMany({
          data: albumIds.map((albumId) => ({ groupId: id, albumId })),
        })
      }

      return tx.group.update({
        where: { id },
        data: groupData,
        include: {
          albums: { include: { album: { select: { id: true, name: true, path: true } } } },
          _count: { select: { members: true } },
        },
      })
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
