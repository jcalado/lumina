import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { generateUniqueSlug } from "@/lib/slugs"
import { z } from "zod"

const moveSchema = z.object({
  albumId: z.string(),
  newParentId: z.string().nullable(),
  siblingOrder: z.array(z.string()).min(1),
})

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const body = await request.json()
    const { albumId, newParentId, siblingOrder } = moveSchema.parse(body)

    const album = await prisma.album.findUnique({ where: { id: albumId } })
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 })
    }

    // Resolve the new parent path
    let newParentPath = ""
    if (newParentId) {
      const parent = await prisma.album.findUnique({ where: { id: newParentId } })
      if (!parent) {
        return NextResponse.json({ error: "Parent album not found" }, { status: 404 })
      }
      newParentPath = parent.path

      // Prevent cycles: can't move into self or own descendants
      if (parent.id === albumId || parent.path.startsWith(album.path + "/")) {
        return NextResponse.json(
          { error: "Cannot move album into itself or its descendants" },
          { status: 400 }
        )
      }
    }

    const oldPath = album.path
    const newPath = newParentPath ? `${newParentPath}/${album.name}` : album.name

    // Check for path collision (only if actually moving)
    if (oldPath !== newPath) {
      const existing = await prisma.album.findUnique({ where: { path: newPath } })
      if (existing) {
        return NextResponse.json(
          { error: "An album already exists at the target location" },
          { status: 400 }
        )
      }
    }

    // Generate a slug for the new scope before the transaction
    const newSlug = oldPath !== newPath
      ? await generateUniqueSlug(album.name, newParentPath, albumId)
      : album.slug

    await prisma.$transaction(async (tx) => {
      if (oldPath !== newPath) {
        // Update all descendant paths first (prefix replacement)
        const descendants = await tx.album.findMany({
          where: { path: { startsWith: oldPath + "/" } },
        })
        for (const desc of descendants) {
          const newDescPath = newPath + desc.path.substring(oldPath.length)
          await tx.album.update({
            where: { id: desc.id },
            data: { path: newDescPath },
          })
        }

        // Update the album's own path and slug
        await tx.album.update({
          where: { id: albumId },
          data: { path: newPath, slug: newSlug },
        })
      }

      // Update displayOrder for all siblings in the target parent
      for (let i = 0; i < siblingOrder.length; i++) {
        await tx.album.update({
          where: { id: siblingOrder[i] },
          data: { displayOrder: i },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      )
    }
    console.error("Error moving album:", error)
    return NextResponse.json(
      { error: "Failed to move album" },
      { status: 500 }
    )
  }
}
