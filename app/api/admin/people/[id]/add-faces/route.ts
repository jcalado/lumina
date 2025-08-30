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
    const { id: personId } = await context.params;
    const body = await request.json();
    const { faceIds } = body;

    if (!faceIds || !Array.isArray(faceIds) || faceIds.length === 0) {
      return NextResponse.json({ error: 'No face IDs provided' }, { status: 400 });
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: personId },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // Update faces to assign them to the person
    const updateResult = await prisma.face.updateMany({
      where: {
        id: {
          in: faceIds,
        },
        personId: null, // Only update unassigned faces
      },
      data: {
        personId: personId,
      },
    });

    // Recompute prototypes (best-effort)
    try { await recomputePersonPrototypes(personId); } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Successfully added ${updateResult.count} faces to person ${person.name}`,
      count: updateResult.count,
    });
  } catch (error) {
    console.error('Error adding faces to person:', error);
    return NextResponse.json(
      { error: 'Failed to add faces to person' },
      { status: 500 }
    );
  }
}
