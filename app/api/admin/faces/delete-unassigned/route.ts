import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DELETE: Remove all unassigned faces
export async function DELETE(request: NextRequest) {
  try {
    // Delete all faces that don't have a personId (unassigned faces)
    const deletedFacesResult = await prisma.face.deleteMany({
      where: {
        personId: null
      }
    });

    return NextResponse.json({
      message: `Successfully deleted ${deletedFacesResult.count} unassigned faces`,
      deletedFaces: deletedFacesResult.count
    });
  } catch (error) {
    console.error('Failed to delete unassigned faces:', error);
    return NextResponse.json(
      { error: 'Failed to delete unassigned faces' },
      { status: 500 }
    );
  }
}
