import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { z } from "zod";

const reorderSchema = z.object({
  // Ordered list of root album IDs (level 0)
  order: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const { order } = reorderSchema.parse(body);

    // Update displayOrder for provided albums in a single transaction
    const tx = order.map((albumId, index) =>
      prisma.album.update({
        where: { id: albumId },
        data: { displayOrder: index },
      })
    );

    await prisma.$transaction(tx);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error reordering albums:", error);
    return NextResponse.json(
      { error: "Failed to reorder albums" },
      { status: 500 }
    );
  }
}

