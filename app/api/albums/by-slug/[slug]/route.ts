import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/albums/by-slug/[slug] - Get album by slug
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Use raw query to avoid TypeScript issues
    const albums = await prisma.$queryRaw`
      SELECT 
        id,
        path,
        slug,
        name,
        description,
        (SELECT COUNT(*) FROM photos WHERE albumId = albums.id) as photoCount
      FROM albums 
      WHERE slug = ${slug}
        AND enabled = 1 
        AND status = 'PUBLIC'
    ` as any[];

    if (albums.length === 0) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      );
    }

    const album = albums[0];

    // Transform the album data to match the expected format
    const albumData = {
      id: album.id,
      path: album.path,
      slug: album.slug,
      name: album.name,
      description: album.description,
      photoCount: Number(album.photoCount),
      thumbnails: [] // Can be populated later if needed
    };

    return NextResponse.json({ album: albumData });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch album" },
      { status: 500 }
    );
  }
}
