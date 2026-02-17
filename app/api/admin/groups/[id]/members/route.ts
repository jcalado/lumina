import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const membersSchema = z.object({
  userIds: z.array(z.string()).min(1, "At least one user ID is required"),
})

interface Params {
  id: string
}

// POST /api/admin/groups/[id]/members - Add members to group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  try {
    const body = await request.json()
    const { userIds } = membersSchema.parse(body)

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!group) {
      return NextResponse.json(
        { error: "Group not found" },
        { status: 404 }
      )
    }

    // Create user-group associations, skip existing ones
    const results = await Promise.allSettled(
      userIds.map((userId) =>
        prisma.userGroup.create({
          data: { userId, groupId: id },
        })
      )
    )

    const added = results.filter((r) => r.status === "fulfilled").length
    const skipped = results.filter((r) => r.status === "rejected").length

    return NextResponse.json({
      added,
      skipped,
      message: `${added} member(s) added${skipped > 0 ? `, ${skipped} already in group` : ""}`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    console.error("Error adding members:", error)
    return NextResponse.json(
      { error: "Failed to add members" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/groups/[id]/members - Remove members from group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) return authResult

  const { id } = await params

  try {
    const body = await request.json()
    const { userIds } = membersSchema.parse(body)

    const result = await prisma.userGroup.deleteMany({
      where: {
        groupId: id,
        userId: { in: userIds },
      },
    })

    return NextResponse.json({
      removed: result.count,
      message: `${result.count} member(s) removed`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }
    console.error("Error removing members:", error)
    return NextResponse.json(
      { error: "Failed to remove members" },
      { status: 500 }
    )
  }
}
