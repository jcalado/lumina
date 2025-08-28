import { prisma } from '../lib/prisma';

async function migrateHasEmbeddingField() {
  console.log('Starting hasEmbedding field migration...');

  try {
    // Update all faces with embeddings to set hasEmbedding = true
    const result = await prisma.face.updateMany({
      where: {
        embedding: {
          not: null
        }
      },
      data: {
        hasEmbedding: true
      }
    });

    console.log(`Updated ${result.count} faces with hasEmbedding = true`);

    // Verify the migration
    const withEmbedding = await prisma.face.count({
      where: { hasEmbedding: true }
    });

    const withEmbeddingData = await prisma.face.count({
      where: {
        embedding: { not: null }
      }
    });

    console.log(`Faces with hasEmbedding = true: ${withEmbedding}`);
    console.log(`Faces with embedding data: ${withEmbeddingData}`);

    if (withEmbedding === withEmbeddingData) {
      console.log('Migration completed successfully!');
    } else {
      console.log('Migration may have issues - counts don\'t match');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateHasEmbeddingField();
