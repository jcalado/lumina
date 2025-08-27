import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DELETE: Remove all people and unassign their faces
export async function DELETE(request: NextRequest) {
  try {
    // First, unassign all faces (set personId to null)
    const unassignedFacesResult = await prisma.face.updateMany({
      where: {
        personId: { not: null }
      },
      data: {
        personId: null
      }
    });

    // Then, delete all people records
    const deletedPeopleResult = await prisma.person.deleteMany({});

    return NextResponse.json({
      message: `Successfully removed ${deletedPeopleResult.count} people and unassigned ${unassignedFacesResult.count} faces`,
      deletedPeople: deletedPeopleResult.count,
      unassignedFaces: unassignedFacesResult.count
    });
  } catch (error) {
    console.error('Failed to delete all people:', error);
    return NextResponse.json(
      { error: 'Failed to delete all people' },
      { status: 500 }
    );
  }
}
