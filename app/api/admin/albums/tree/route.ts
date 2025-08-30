import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

// GET /api/admin/albums/tree - Get albums in tree structure for face recognition
export async function GET() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    // Get all albums with their photo counts
    const albums = await prisma.album.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        path: true,
        createdAt: true,
        _count: {
          select: { photos: true }
        }
      },
      orderBy: [
        { path: "asc" },
        { name: "asc" }
      ]
    })

    // Get face processing stats for each album
    const faceStats = await prisma.$queryRaw<Array<{
      albumId: string;
      totalPhotos: number;
      processedPhotos: number;
    }>>`
      SELECT
        a.id as "albumId",
        COUNT(p.id) as "totalPhotos",
        COUNT(CASE WHEN p."faceProcessedAt" IS NOT NULL THEN 1 END) as "processedPhotos"
      FROM "albums" a
      LEFT JOIN "photos" p ON a.id = p."albumId"
      GROUP BY a.id
    `

    // Create a map of album stats
    const statsMap = new Map<string, { totalPhotos: number; processedPhotos: number }>()
    faceStats.forEach(stat => {
      statsMap.set(stat.albumId, {
        totalPhotos: Number(stat.totalPhotos),
        processedPhotos: Number(stat.processedPhotos)
      })
    })

    // Build tree structure
    const buildTree = (albums: any[], parentPath: string = '', depth: number = 0): any[] => {
      const children = albums.filter(album => {
        const albumPath = album.path || ''
        const parentPathNormalized = parentPath === '/' ? '' : parentPath
        return albumPath.startsWith(parentPathNormalized) &&
               (parentPathNormalized === '' || albumPath !== parentPathNormalized) &&
               albumPath.split('/').length === (parentPathNormalized ? parentPathNormalized.split('/').length + 1 : 1)
      })

      return children.map(album => {
        const stats = statsMap.get(album.id) || { totalPhotos: 0, processedPhotos: 0 }
        const albumNode = {
          id: album.id,
          name: album.name,
          slug: album.slug,
          path: album.path || '',
          totalPhotos: stats.totalPhotos,
          unprocessedPhotos: stats.totalPhotos - stats.processedPhotos,
          depth: depth,
          children: buildTree(albums, album.path || '', depth + 1)
        }
        return albumNode
      })
    }

    const tree = buildTree(albums)

    return NextResponse.json({ albums: tree })
  } catch (error) {
    console.error("Error fetching album tree:", error)
    return NextResponse.json(
      { error: "Failed to fetch album tree" },
      { status: 500 }
    )
  }
}
