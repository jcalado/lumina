import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { s3 } from "@/lib/s3"
import fs from 'fs/promises'
import path from 'path'
import { z } from "zod"

const deletePhotosSchema = z.object({
  photoIds: z.array(z.string()).min(1, "At least one photo ID is required")
})

// POST /api/admin/albums/[id]/photos/delete - Delete photos from album
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { id: albumId } = await params
    const body = await request.json()
    const { photoIds } = deletePhotosSchema.parse(body)

    // Verify album exists
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, name: true, path: true }
    })

    if (!album) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      )
    }

    // Get photos to delete with their details
    const photosToDelete = await prisma.photo.findMany({
      where: {
        id: { in: photoIds },
        albumId: albumId
      },
      include: {
        thumbnails: true
      }
    })

    if (photosToDelete.length === 0) {
      return NextResponse.json(
        { error: "No photos found to delete" },
        { status: 404 }
      )
    }

    // Track deletion results
    const deletionResults = {
      photos: 0,
      thumbnails: 0,
      localFiles: 0,
      s3Files: 0,
      errors: [] as string[]
    }

    // Process each photo
    for (const photo of photosToDelete) {
      try {
        // Delete from S3 (main photo)
        try {
          await s3.deleteObject(photo.s3Key)
          deletionResults.s3Files++
        } catch (s3Error) {
          console.error(`Failed to delete S3 file ${photo.s3Key}:`, s3Error)
          deletionResults.errors.push(`Failed to delete S3 file: ${photo.filename}`)
        }

        // Delete thumbnails from S3
        for (const thumbnail of photo.thumbnails) {
          try {
            await s3.deleteObject(thumbnail.s3Key)
            deletionResults.thumbnails++
          } catch (s3Error) {
            console.error(`Failed to delete S3 thumbnail ${thumbnail.s3Key}:`, s3Error)
            deletionResults.errors.push(`Failed to delete thumbnail for: ${photo.filename}`)
          }
        }

        // Delete local file if it exists
        try {
          const localFilePath = path.resolve(photo.originalPath)
          await fs.access(localFilePath)
          await fs.unlink(localFilePath)
          deletionResults.localFiles++
        } catch (localError) {
          // File might not exist locally, which is okay
          console.log(`Local file not found or already deleted: ${photo.originalPath}`)
        }

        // Delete from database (cascades to thumbnails and faces)
        await prisma.photo.delete({
          where: { id: photo.id }
        })
        deletionResults.photos++

      } catch (error) {
        console.error(`Error deleting photo ${photo.id}:`, error)
        deletionResults.errors.push(`Failed to delete photo: ${photo.filename}`)
      }
    }

    // Log the operation
    console.log(`Photo deletion completed for album ${album.name}:`, {
      requested: photoIds.length,
      deleted: deletionResults.photos,
      thumbnails: deletionResults.thumbnails,
      localFiles: deletionResults.localFiles,
      s3Files: deletionResults.s3Files,
      errors: deletionResults.errors.length
    })

    return NextResponse.json({
      success: true,
      deletedCount: deletionResults.photos,
      thumbnailsDeleted: deletionResults.thumbnails,
      localFilesDeleted: deletionResults.localFiles,
      s3FilesDeleted: deletionResults.s3Files,
      errors: deletionResults.errors,
      message: deletionResults.errors.length > 0 
        ? `${deletionResults.photos} photos deleted with some errors` 
        : `${deletionResults.photos} photos deleted successfully`
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error deleting photos:", error)
    return NextResponse.json(
      { error: "Failed to delete photos" },
      { status: 500 }
    )
  }
}
