const { PrismaClient } = require('@prisma/client');

async function setupFaceRecognitionSettings() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Setting up face recognition default settings...');
    
    const defaultSettings = [
      { key: 'faceRecognitionEnabled', value: 'false' },
      { key: 'faceRecognitionPublicEnabled', value: 'false' },
      { key: 'faceRecognitionBatchSize', value: '4' },
      { key: 'faceRecognitionParallelProcessing', value: '4' },
      { key: 'faceRecognitionConfidenceThreshold', value: '0.5' },
      { key: 'faceRecognitionSimilarityThreshold', value: '0.7' },
      { key: 'peoplePageEnabled', value: 'false' },
    ];
    
    for (const setting of defaultSettings) {
      await prisma.siteSettings.upsert({
        where: { key: setting.key },
        update: { value: setting.value },
        create: setting,
      });
      console.log(`Set ${setting.key} = ${setting.value}`);
    }
    
    console.log('Face recognition settings setup complete!');
  } catch (error) {
    console.error('Error setting up face recognition settings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupFaceRecognitionSettings();
