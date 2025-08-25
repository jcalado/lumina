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
    const personId = resolvedParams.id;
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

    // Increment faceCount for the person
    if (updateResult.count > 0) {
      await prisma.person.update({
        where: { id: personId },
        data: {
          faceCount: {
            increment: updateResult.count,
          },
        },
      });
    }

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
