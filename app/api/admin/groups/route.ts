import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  albumId: z.string().min(1, "Album is required"),
  canUpload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canCreateSubalbums: z.boolean().default(false),
})

// GET /api/admin/groups - List all groups
export async function GET() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  try {
    const groups = await prisma.group.findMany({
      include: {
        album: { select: { id: true, name: true, path: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ groups })
  } catch (error) {
    console.error("Error fetching groups:", error)
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    )
  }
}

// POST /api/admin/groups - Create a group
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json()
    const data = createGroupSchema.parse(body)

    // Verify album exists
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

    const group = await prisma.group.create({
      data: {
        name: data.name,
        description: data.description || null,
        albumId: data.albumId,
        canUpload: data.canUpload,
        canEdit: data.canEdit,
        canDelete: data.canDelete,
        canCreateSubalbums: data.canCreateSubalbums,
      },
      include: {
        album: { select: { id: true, name: true, path: true } },
        _count: { select: { members: true } },
      },
    })

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creating group:", error)
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    )
  }
}
