import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST: Create person from selected faces
export async function POST(request: NextRequest) {
  try {
    let body;
    
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    console.log('Received body:', body);
    
    const { name, faceIds } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Person name is required' },
        { status: 400 }
      );
    }

    if (!faceIds || !Array.isArray(faceIds) || faceIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one face ID is required' },
        { status: 400 }
      );
    }

    // Create the person using transaction for atomicity
    let personId: string;
    let actualFaceCount: number;
    
    try {
      console.log('Creating person with name:', name.trim());
      
      const result = await prisma.$transaction(async (tx) => {
        // Create person via Prisma to use CUID id and correct columns
        const person = await tx.person.create({
          data: {
            name: name.trim(),
            confirmed: false,
          },
          select: { id: true },
        });

        // Assign all requested faces that are currently unassigned
        const updateResult = await tx.face.updateMany({
          where: { id: { in: faceIds as string[] }, personId: null },
          data: { personId: person.id },
        });

        const updatedFaceCount = updateResult.count;
        console.log(`Successfully updated ${updatedFaceCount} out of ${faceIds.length} faces`);

        if (updatedFaceCount === 0) {
          throw new Error('No faces were available for assignment. They may have already been assigned to other people.');
        }

        return { id: person.id, updatedFaceCount };
      });

      personId = result.id;
      actualFaceCount = result.updatedFaceCount;

    } catch (createError: any) {
      console.error('Error in transaction:', createError);
      return NextResponse.json(
        { error: createError.message || 'Failed to create person' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      id: personId,
      name: name.trim(),
      confirmed: false,
      faceCount: actualFaceCount,
      message: `Created person "${name.trim()}" with ${actualFaceCount} faces`,
    });

  } catch (error) {
    console.error('Error creating person from faces:', error);
    return NextResponse.json(
      { error: 'Failed to create person' },
      { status: 500 }
    );
  }
}
