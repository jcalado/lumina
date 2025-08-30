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

    await prisma.face.update({
      where: { id: faceId },
      data: {
        ignored: true,
        personId: null, // Ensure it's unassigned if ignored
      },
    });
    try { if (face.personId) await recomputePersonPrototypes(face.personId); } catch (e) {}
    return NextResponse.json({ success: true, message: 'Face ignored successfully' });
  } catch (error) {
    console.error('Error ignoring face:', error);
    return NextResponse.json(
      { error: 'Failed to ignore face' },
      { status: 500 }
    );
  }
}
