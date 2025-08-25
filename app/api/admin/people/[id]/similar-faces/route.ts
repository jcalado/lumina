import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSimilarity } from '@/lib/face-detection';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// Helper to get face recognition settings
async function getFaceRecognitionSettings() {
  const settings = await prisma.siteSettings.findMany({
    where: {
      key: {
        in: [
          'faceRecognitionSimilarityThreshold',
        ],
      },
    },
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  return {
    faceRecognitionSimilarityThreshold: parseFloat(settingsMap.faceRecognitionSimilarityThreshold || '0.7'),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const personId = resolvedParams.id;

    const { faceRecognitionSimilarityThreshold } = await getFaceRecognitionSettings();

    // Get all faces for the given person
    const personFaces = await prisma.face.findMany({
      where: {
        personId: personId,
        embedding: { not: null },
      },
      select: {
        id: true,
        embedding: true,
      },
    });

    if (personFaces.length === 0) {
      return NextResponse.json({ similarFaces: [] });
    }

    // Parse embeddings
    const personEmbeddings = personFaces.map(face => JSON.parse(face.embedding as string));

    // Get all unassigned faces
    const unassignedFaces = await prisma.face.findMany({
      where: {
        personId: null,
        embedding: { not: null },
      },
      include: {
        photo: {
          select: {
            id: true,
            filename: true,
            thumbnails: true,
          },
        },
      },
    });

    const similarFaces = [];

    for (const unassignedFace of unassignedFaces) {
      if (!unassignedFace.embedding) continue;

      const unassignedEmbedding = JSON.parse(unassignedFace.embedding as string);
      let maxSimilarity = 0;

      for (const personEmbedding of personEmbeddings) {
        const similarity = calculateSimilarity(unassignedEmbedding, personEmbedding);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }
      }

      if (maxSimilarity >= faceRecognitionSimilarityThreshold) {
        similarFaces.push({
          ...unassignedFace,
          boundingBox: JSON.parse(unassignedFace.boundingBox),
          similarity: maxSimilarity, // Add similarity for display/sorting
        });
      }
    }

    // Sort by similarity in descending order
    similarFaces.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({ similarFaces });
  } catch (error) {
    console.error('Error finding similar faces:', error);
    return NextResponse.json(
      { error: 'Failed to find similar faces' },
      { status: 500 }
    );
  }
}
