import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetId, sourceIds } = body;

    if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json({ error: 'targetId and sourceIds are required' }, { status: 400 });
    }

    // Ensure target isn't included in sources
    const filteredSourceIds = sourceIds.filter((id: string) => id !== targetId);
    if (filteredSourceIds.length === 0) {
      return NextResponse.json({ error: 'No source persons to merge (target was included in sourceIds)' }, { status: 400 });
    }

    // Verify target exists
    const target = await prisma.person.findUnique({ where: { id: targetId } });
    if (!target) {
      return NextResponse.json({ error: 'Target person not found' }, { status: 404 });
    }

    // Verify sources exist (optional: skip missing ids)
    const sources = await prisma.person.findMany({ where: { id: { in: filteredSourceIds } } });
    if (sources.length === 0) {
      return NextResponse.json({ error: 'No valid source persons found to merge' }, { status: 404 });
    }

    // Perform transactional merge: reassign faces, delete source persons
    const result = await prisma.$transaction(async (tx) => {
      // Reassign faces from sources to target
      const updateFaces = await tx.face.updateMany({
        where: { personId: { in: filteredSourceIds } },
        data: { personId: targetId },
      });

      // Delete source person records
      const deletePersons = await tx.person.deleteMany({ where: { id: { in: filteredSourceIds } } });

      return { movedFaces: updateFaces.count, deletedPersons: deletePersons.count };
    });

    return NextResponse.json({
      success: true,
      message: `Merged ${sources.length} people into "${target.name}". Moved ${result.movedFaces} faces and deleted ${result.deletedPersons} person records.`,
      movedFaces: result.movedFaces,
      deletedPersons: result.deletedPersons,
    });
  } catch (error) {
    console.error('Error merging people:', error);
    return NextResponse.json({ error: 'Failed to merge people' }, { status: 500 });
  }
}
