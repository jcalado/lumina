import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface ProcessRequest {
  similarityThreshold: number;
  mode: 'create_new' | 'assign_existing' | 'both';
}

// POST: Process unassigned faces based on similarity threshold
export async function POST(request: NextRequest) {
  try {
    const body: ProcessRequest = await request.json();
    const { similarityThreshold = 0.7, mode = 'both' } = body;

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      return NextResponse.json(
        { error: 'Similarity threshold must be between 0 and 1' },
        { status: 400 }
      );
    }

    // Get all unassigned faces
    const unassignedFaces = await prisma.face.findMany({
      where: {
        personId: null,
        ignored: { not: true }
      },
      include: {
        photo: {
          include: {
            thumbnails: { where: { size: 'SMALL' } }
          }
        }
      },
      orderBy: { confidence: 'desc' }
    });

    if (unassignedFaces.length === 0) {
      return NextResponse.json({
        message: 'No unassigned faces to process',
        processed: 0,
        newPeople: 0,
        assignedToExisting: 0
      });
    }

    let processedCount = 0;
    let newPeopleCount = 0;
    let assignedToExistingCount = 0;

    // Get existing people for comparison (if mode allows assignment to existing)
    const existingPeople = (mode === 'assign_existing' || mode === 'both') 
      ? await prisma.person.findMany({
          include: {
            faces: {
              where: { ignored: { not: true } },
              orderBy: { confidence: 'desc' },
              take: 5 // Take top 5 faces for comparison
            }
          }
        })
      : [];

    // Simple face clustering based on confidence and basic similarity
    // This is a simplified implementation - in a real system, you'd use proper face embeddings
    const processedFaces = new Set<string>();
    const clusters: { faces: typeof unassignedFaces; representative?: typeof unassignedFaces[0] }[] = [];

    for (const face of unassignedFaces) {
      if (processedFaces.has(face.id)) continue;

      // Try to assign to existing person first (if mode allows)
      let assignedToExisting = false;
      if (mode === 'assign_existing' || mode === 'both') {
        for (const person of existingPeople) {
          if (person.faces.length === 0) continue;
          
          // Simple similarity check based on confidence difference
          // In a real implementation, you'd compare face embeddings
          const avgConfidence = person.faces.reduce((sum: number, f: { confidence: number }) => sum + f.confidence, 0) / person.faces.length;
          const confidenceDiff = Math.abs(face.confidence - avgConfidence);
          
          if (confidenceDiff <= (1 - similarityThreshold)) {
            // Assign this face to the existing person
            await prisma.face.update({
              where: { id: face.id },
              data: { personId: person.id }
            });
            
            processedFaces.add(face.id);
            processedCount++;
            assignedToExistingCount++;
            assignedToExisting = true;
            break;
          }
        }
      }

      if (assignedToExisting) continue;

      // If not assigned to existing, try to create new cluster
      if (mode === 'create_new' || mode === 'both') {
        const cluster = { faces: [face] };
        
        // Find similar faces for this cluster
        for (const otherFace of unassignedFaces) {
          if (processedFaces.has(otherFace.id) || otherFace.id === face.id) continue;
          
          // Simple similarity check based on confidence
          const confidenceDiff = Math.abs(face.confidence - otherFace.confidence);
          
          if (confidenceDiff <= (1 - similarityThreshold)) {
            cluster.faces.push(otherFace);
            processedFaces.add(otherFace.id);
          }
        }
        
        processedFaces.add(face.id);
        clusters.push(cluster);
      }
    }

    // Create new people from clusters
    for (const cluster of clusters) {
      if (cluster.faces.length === 0) continue;
      
      // Create new person
      const person = await prisma.person.create({
        data: {
          name: `Person ${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
          confirmed: false
        }
      });

      // Assign all faces in cluster to this person
      await prisma.face.updateMany({
        where: {
          id: { in: cluster.faces.map(f => f.id) }
        },
        data: {
          personId: person.id
        }
      });

      processedCount += cluster.faces.length;
      newPeopleCount++;
    }

    return NextResponse.json({
      message: `Processed ${processedCount} faces: created ${newPeopleCount} new people, assigned ${assignedToExistingCount} to existing people`,
      processed: processedCount,
      newPeople: newPeopleCount,
      assignedToExisting: assignedToExistingCount,
      totalUnassigned: unassignedFaces.length
    });

  } catch (error) {
    console.error('Failed to process unassigned faces:', error);
    return NextResponse.json(
      { error: 'Failed to process unassigned faces' },
      { status: 500 }
    );
  }
}
