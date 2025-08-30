import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recomputePersonPrototypes } from '@/lib/prototypes';

interface Params {
  id: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: faceId } = await context.params;

    const face = await prisma.face.findUnique({
      where: { id: faceId },
    });

    if (!face) {
      return NextResponse.json({ error: 'Face not found' }, { status: 404 });
    }

    if (face.personId === null) {
      return NextResponse.json({ message: 'Face is already unassigned' }, { status: 200 });
    }

    await prisma.face.update({
      where: { id: faceId },
      data: {
        personId: null,
      },
    });
    // Recompute prototypes for the affected person
    try { await recomputePersonPrototypes(face.personId!); } catch (e) {}
    return NextResponse.json({ success: true, message: 'Face unassigned successfully' });
  } catch (error) {
    console.error('Error unassigning face:', error);
    return NextResponse.json(
      { error: 'Failed to unassign face' },
      { status: 500 }
    );
  }
}
