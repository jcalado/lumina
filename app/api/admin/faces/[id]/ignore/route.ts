import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const faceId = resolvedParams.id;

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

    return NextResponse.json({ success: true, message: 'Face ignored successfully' });
  } catch (error) {
    console.error('Error ignoring face:', error);
    return NextResponse.json(
      { error: 'Failed to ignore face' },
      { status: 500 }
    );
  }
}
