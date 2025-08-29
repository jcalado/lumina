import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Body {
  faceIds?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json().catch(() => ({} as Body));
    const faceIds = Array.isArray(body.faceIds) ? body.faceIds.filter(Boolean) : [];
    if (faceIds.length === 0) {
      return NextResponse.json({ error: 'faceIds is required' }, { status: 400 });
    }

    const result = await prisma.face.updateMany({
      where: { id: { in: faceIds } },
      data: { ignored: true, personId: null },
    });

    return NextResponse.json({ success: true, count: result.count, message: `Disabled ${result.count} face(s)` });
  } catch (error) {
    console.error('Error disabling faces:', error);
    return NextResponse.json({ error: 'Failed to disable faces' }, { status: 500 });
  }
}

