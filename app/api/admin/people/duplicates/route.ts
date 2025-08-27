import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Function to calculate similarity between two face embeddings
function calculateFaceSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) return 0;
  
  // Calculate cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Function to calculate string similarity (Levenshtein distance based)
function calculateNameSimilarity(name1: string, name2: string): number {
  const str1 = name1.toLowerCase().trim();
  const str2 = name2.toLowerCase().trim();
  
  if (str1 === str2) return 1.0;
  
  // Simple partial match scoring
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  // Levenshtein distance
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,
        matrix[j][i - 1] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 1 : 1 - (matrix[str2.length][str1.length] / maxLength);
}

interface DuplicateGroup {
  id: string;
  people: Array<{
    id: string;
    name: string;
    confirmed: boolean;
    faceCount: number;
    previewFace?: {
      id: string;
      confidence: number;
    };
    createdAt: Date;
  }>;
  similarityScore: number;
  similarityType: 'name' | 'face' | 'both';
  confidence: 'high' | 'medium' | 'low';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nameThreshold = parseFloat(searchParams.get('nameThreshold') || '0.7');
    const faceThreshold = parseFloat(searchParams.get('faceThreshold') || '0.8');
    
    // Get all people with their faces and embeddings
    const people = await prisma.person.findMany({
      include: {
        faces: {
          where: { embedding: { not: null } },
          take: 3, // Sample a few faces for comparison
          select: { 
            id: true, 
            embedding: true, 
            confidence: true 
          },
          orderBy: { confidence: 'desc' }
        },
        _count: { select: { faces: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (people.length < 2) {
      return NextResponse.json({ duplicateGroups: [] });
    }

    const duplicateGroups: DuplicateGroup[] = [];
    const processedPairs = new Set<string>();

    // Compare all pairs of people
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const person1 = people[i];
        const person2 = people[j];
        
        const pairKey = [person1.id, person2.id].sort().join('-');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        let nameSimilarity = 0;
        let faceSimilarity = 0;
        let similarityType: 'name' | 'face' | 'both' = 'name';

        // Check name similarity
        if (person1.name && person2.name) {
          nameSimilarity = calculateNameSimilarity(person1.name, person2.name);
        } else if (person1.name || person2.name) {
          // If only one has a name, similarity is very low
          nameSimilarity = 0.1;
        }

        // Check face similarity
        if (person1.faces.length > 0 && person2.faces.length > 0) {
          let maxFaceSimilarity = 0;
          
          for (const face1 of person1.faces) {
            for (const face2 of person2.faces) {
              if (!face1.embedding || !face2.embedding) continue;
              
              try {
                const embedding1 = JSON.parse(face1.embedding) as number[];
                const embedding2 = JSON.parse(face2.embedding) as number[];
                const similarity = calculateFaceSimilarity(embedding1, embedding2);
                maxFaceSimilarity = Math.max(maxFaceSimilarity, similarity);
              } catch (e) {
                // Skip invalid embeddings
              }
            }
          }
          
          faceSimilarity = maxFaceSimilarity;
        }

        // Determine if this is a potential duplicate
        const isNameDuplicate = nameSimilarity >= nameThreshold;
        const isFaceDuplicate = faceSimilarity >= faceThreshold;

        if (isNameDuplicate || isFaceDuplicate) {
          // Determine similarity type and overall score
          if (isNameDuplicate && isFaceDuplicate) {
            similarityType = 'both';
          } else if (isFaceDuplicate) {
            similarityType = 'face';
          } else {
            similarityType = 'name';
          }

          const overallScore = Math.max(nameSimilarity, faceSimilarity);
          
          // Determine confidence level
          let confidence: 'high' | 'medium' | 'low';
          if (overallScore >= 0.9 || (nameSimilarity >= 0.8 && faceSimilarity >= 0.8)) {
            confidence = 'high';
          } else if (overallScore >= 0.8 || (nameSimilarity >= 0.7 && faceSimilarity >= 0.7)) {
            confidence = 'medium';
          } else {
            confidence = 'low';
          }

          duplicateGroups.push({
            id: `dup_${person1.id}_${person2.id}`,
            people: [
              {
                id: person1.id,
                name: person1.name || 'Unnamed Person',
                confirmed: person1.confirmed,
                faceCount: person1._count.faces,
                previewFace: person1.faces[0] ? {
                  id: person1.faces[0].id,
                  confidence: person1.faces[0].confidence
                } : undefined,
                createdAt: person1.createdAt
              },
              {
                id: person2.id,
                name: person2.name || 'Unnamed Person',
                confirmed: person2.confirmed,
                faceCount: person2._count.faces,
                previewFace: person2.faces[0] ? {
                  id: person2.faces[0].id,
                  confidence: person2.faces[0].confidence
                } : undefined,
                createdAt: person2.createdAt
              }
            ],
            similarityScore: overallScore,
            similarityType,
            confidence
          });
        }
      }
    }

    // Sort by confidence and similarity score
    duplicateGroups.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
      if (confDiff !== 0) return confDiff;
      return b.similarityScore - a.similarityScore;
    });

    return NextResponse.json({ 
      duplicateGroups,
      stats: {
        totalPeople: people.length,
        totalDuplicateGroups: duplicateGroups.length,
        highConfidence: duplicateGroups.filter(g => g.confidence === 'high').length,
        mediumConfidence: duplicateGroups.filter(g => g.confidence === 'medium').length,
        lowConfidence: duplicateGroups.filter(g => g.confidence === 'low').length
      }
    });
  } catch (error) {
    console.error('Error detecting duplicate people:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST: Merge duplicate people
export async function POST(request: NextRequest) {
  try {
    const { targetPersonId, sourcePersonIds } = await request.json();

    if (!targetPersonId || !Array.isArray(sourcePersonIds) || sourcePersonIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid merge request. Target person ID and source person IDs are required.' },
        { status: 400 }
      );
    }

    // Verify all people exist
    const allPersonIds = [targetPersonId, ...sourcePersonIds];
    const existingPeople = await prisma.person.findMany({
      where: { id: { in: allPersonIds } },
      select: { id: true, name: true }
    });

    if (existingPeople.length !== allPersonIds.length) {
      return NextResponse.json(
        { error: 'One or more people not found' },
        { status: 404 }
      );
    }

    const targetPerson = existingPeople.find(p => p.id === targetPersonId);
    const sourcePeople = existingPeople.filter(p => sourcePersonIds.includes(p.id));

    // Move all faces from source people to target person
    for (const sourcePersonId of sourcePersonIds) {
      await prisma.face.updateMany({
        where: { personId: sourcePersonId },
        data: { personId: targetPersonId }
      });
    }

    // Delete the source people
    await prisma.person.deleteMany({
      where: { id: { in: sourcePersonIds } }
    });

    // Get updated face count for target person
    const updatedPerson = await prisma.person.findUnique({
      where: { id: targetPersonId },
      include: { _count: { select: { faces: true } } }
    });

    return NextResponse.json({ 
      success: true,
      message: `Successfully merged ${sourcePeople.length} people into "${targetPerson?.name}".`,
      targetPerson: {
        id: targetPersonId,
        name: targetPerson?.name,
        faceCount: updatedPerson?._count.faces || 0
      },
      mergedPeople: sourcePeople.map(p => ({ id: p.id, name: p.name }))
    });

  } catch (error) {
    console.error('Error merging duplicate people:', error);
    return NextResponse.json(
      { error: 'Failed to merge people', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
