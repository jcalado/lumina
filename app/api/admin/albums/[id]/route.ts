import { NextRequest, NextResponse } from "next/server"
import { requireAlbumRead, requireAlbumAccess } from "@/lib/album-auth"
import { prisma } from "@/lib/prisma"
import { generateUniqueSlug, isValidSlug } from "@/lib/slugs"
import { z } from "zod"

const updateAlbumSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  slug: z.string().min(1).optional(),
  status: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  enabled: z.boolean().optional(),
  featured: z.boolean().optional(),
})

// GET /api/admin/albums/[id] - Get album details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authResult = await requireAlbumRead(id)
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            photos: true,
            videos: true
          }
        }
      }
    })

    if (!album) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ album })
  } catch (error) {
    console.error("Error fetching album:", error)
    return NextResponse.json(
      { error: "Failed to fetch album" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/albums/[id] - Update album settings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authResult = await requireAlbumAccess(id, "can_edit")
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const body = await request.json()
    const validatedData = updateAlbumSchema.parse(body)

    // Handle slug validation and generation
    let slugToUpdate = validatedData.slug;

    if (validatedData.slug !== undefined) {
      if (!isValidSlug(validatedData.slug)) {
        return NextResponse.json(
          { error: "Invalid slug format. Slug must contain only lowercase letters, numbers, and hyphens." },
          { status: 400 }
        )
      }

      // Check if slug is unique using raw query
      const existingAlbum = await prisma.$queryRaw`
        SELECT id FROM albums WHERE slug = ${validatedData.slug} AND id != ${id}
      ` as any[];

      if (existingAlbum.length > 0) {
        return NextResponse.json(
          { error: "Slug already exists. Please choose a different slug." },
          { status: 400 }
        )
      }
    }

    // If name is being updated but slug is not provided, generate new slug
    if (validatedData.name && !validatedData.slug) {
      slugToUpdate = await generateUniqueSlug(validatedData.name, id);
    }

    // Enforce single-featured constraint
    if (validatedData.featured === true) {
      await prisma.album.updateMany({
        where: { featured: true, id: { not: id } },
        data: { featured: false },
      });
    }

    const updateData = {
      ...validatedData,
      ...(slugToUpdate && { slug: slugToUpdate })
    };

    const album = await prisma.album.update({
      where: { id },
      data: updateData,
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
  const { id } = await params

  const authResult = await requireAlbumAccess(id, "can_delete")
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
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
