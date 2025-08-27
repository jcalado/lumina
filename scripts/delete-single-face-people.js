// Delete every person with only 1 assigned face and unassign their face
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting deletion of people with single faces...');

  try {
    // Use raw SQL to find people with exactly one face efficiently
    const singleFacePeople = await prisma.$queryRaw`
      SELECT 
        p.id as personId,
        p.name,
        f.id as faceId
      FROM Person p
      INNER JOIN Face f ON p.id = f.personId
      WHERE p.id IN (
        SELECT personId 
        FROM Face 
        GROUP BY personId 
        HAVING COUNT(*) = 1
      )
    `;

    console.log(`Found ${singleFacePeople.length} people with single faces`);

    let deletedCount = 0;
    let errorCount = 0;

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < singleFacePeople.length; i += batchSize) {
      const batch = singleFacePeople.slice(i, i + batchSize);
      
      for (const person of batch) {
        try {
          // Unassign the face and delete the person in a transaction
          await prisma.$transaction([
            prisma.face.update({
              where: { id: person.faceId },
              data: { personId: null },
            }),
            prisma.person.delete({
              where: { id: person.personId },
            }),
          ]);
          
          console.log(`Deleted person ${person.personId} (${person.name}) and unassigned face ${person.faceId}`);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting person ${person.personId}:`, error.message);
          errorCount++;
        }
      }
      
      console.log(`Processed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(singleFacePeople.length / batchSize)}`);
    }

    console.log(`Done. Deleted ${deletedCount} people. Errors: ${errorCount}`);

  } catch (error) {
    console.error('Error in main function:', error);
    throw error;
  }
}

main()
  .catch(e => { 
    console.error('Script failed:', e); 
    process.exit(1); 
  })
  .finally(() => prisma.$disconnect());
