import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.siteSettings.findMany({
      where: {
        key: {
          in: [
            'faceRecognitionEnabled',
            'faceRecognitionPublicEnabled',
            'faceRecognitionBatchSize',
            'faceRecognitionParallelProcessing',
            'faceRecognitionConfidenceThreshold',
            'faceRecognitionSimilarityThreshold',
            'peoplePageEnabled',
          ],
        },
      },
    });

    const settingsMap = settings.reduce((acc: Record<string, string>, setting: { key: string; value: string }) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json({
      faceRecognitionEnabled: settingsMap.faceRecognitionEnabled === 'true',
      faceRecognitionPublicEnabled: settingsMap.faceRecognitionPublicEnabled === 'true',
      faceRecognitionBatchSize: parseInt(settingsMap.faceRecognitionBatchSize || '4'),
      faceRecognitionParallelProcessing: parseInt(settingsMap.faceRecognitionParallelProcessing || '4'),
      faceRecognitionConfidenceThreshold: parseFloat(settingsMap.faceRecognitionConfidenceThreshold || '0.5'),
      faceRecognitionSimilarityThreshold: parseFloat(settingsMap.faceRecognitionSimilarityThreshold || '0.7'),
      peoplePageEnabled: settingsMap.peoplePageEnabled === 'true',
    });
  } catch (error) {
    console.error('Error fetching face recognition settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      faceRecognitionEnabled,
      faceRecognitionPublicEnabled,
      faceRecognitionBatchSize,
      faceRecognitionParallelProcessing,
      faceRecognitionConfidenceThreshold,
      faceRecognitionSimilarityThreshold,
      peoplePageEnabled,
    } = body;

    // Validate values
    if (faceRecognitionBatchSize < 1 || faceRecognitionBatchSize > 20) {
      return NextResponse.json(
        { error: 'Batch size must be between 1 and 20' },
        { status: 400 }
      );
    }

    if (faceRecognitionParallelProcessing < 1 || faceRecognitionParallelProcessing > 10) {
      return NextResponse.json(
        { error: 'Parallel processing must be between 1 and 10' },
        { status: 400 }
      );
    }

    if (faceRecognitionConfidenceThreshold < 0.1 || faceRecognitionConfidenceThreshold > 1.0) {
      return NextResponse.json(
        { error: 'Confidence threshold must be between 0.1 and 1.0' },
        { status: 400 }
      );
    }

    if (faceRecognitionSimilarityThreshold < 0.1 || faceRecognitionSimilarityThreshold > 1.0) {
      return NextResponse.json(
        { error: 'Similarity threshold must be between 0.1 and 1.0' },
        { status: 400 }
      );
    }

    const settingsToUpdate = [
      { key: 'faceRecognitionEnabled', value: faceRecognitionEnabled.toString() },
      { key: 'faceRecognitionPublicEnabled', value: faceRecognitionPublicEnabled.toString() },
      { key: 'faceRecognitionBatchSize', value: faceRecognitionBatchSize.toString() },
      { key: 'faceRecognitionParallelProcessing', value: faceRecognitionParallelProcessing.toString() },
      { key: 'faceRecognitionConfidenceThreshold', value: faceRecognitionConfidenceThreshold.toString() },
      { key: 'faceRecognitionSimilarityThreshold', value: faceRecognitionSimilarityThreshold.toString() },
      { key: 'peoplePageEnabled', value: peoplePageEnabled.toString() },
    ];

    // Update or create settings
    for (const setting of settingsToUpdate) {
      await prisma.siteSettings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating face recognition settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
