import { prisma } from '../lib/prisma';

async function checkFacesTableSchema() {
  console.log('Checking faces table schema...');

  try {
    // Get the table structure using raw SQL
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'faces'
      ORDER BY ordinal_position;
    `;

    console.log('Faces table columns:');
    console.log('===================');
    for (const column of result as any[]) {
      console.log(`${column.column_name}: ${column.data_type} ${column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${column.column_default ? `DEFAULT ${column.column_default}` : ''}`);
    }

    // Check if hasEmbedding column exists
    const hasEmbeddingExists = (result as any[]).some(col => col.column_name === 'hasEmbedding');
    console.log(`\nhasEmbedding column exists: ${hasEmbeddingExists}`);

  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFacesTableSchema();
