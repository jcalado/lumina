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
        // Create person
        const personResult = await tx.$executeRaw`
          INSERT INTO people (id, name, confirmed, createdAt, updatedAt) 
          VALUES (
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
            ${name.trim()}, 
            0, 
            datetime('now'), 
            datetime('now')
          )
        `;
        
        console.log('Person creation result:', personResult);

        // Get the created person
        const createdPerson = await tx.$queryRaw`
          SELECT * FROM people WHERE name = ${name.trim()} ORDER BY createdAt DESC LIMIT 1
        `;
        
        console.log('Created person query result:', createdPerson);

        const person = (createdPerson as any[])[0];
        if (!person) {
          throw new Error('Failed to create person');
        }

        // Update faces to assign them to the person one by one
        let updatedFaceCount = 0;
        const failedFaces = [];
        
        for (const faceId of faceIds) {
          const updateResult = await tx.$executeRaw`
            UPDATE faces SET personId = ${person.id} WHERE id = ${faceId} AND personId IS NULL
          `;
          const affectedRows = Number(updateResult);
          console.log(`Updated face ${faceId}, result:`, affectedRows);
          
          if (affectedRows > 0) {
            updatedFaceCount++;
          } else {
            failedFaces.push(faceId);
          }
        }
        
        console.log(`Successfully updated ${updatedFaceCount} out of ${faceIds.length} faces`);
        console.log('Failed faces:', failedFaces);
        
        if (updatedFaceCount === 0) {
          throw new Error('No faces were available for assignment. They may have already been assigned to other people.');
        }
        
        return { ...person, updatedFaceCount };
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
