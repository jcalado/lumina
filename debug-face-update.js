const { PrismaClient } = require('@prisma/client');

async function checkFaceIds() {
  const prisma = new PrismaClient();
  
  try {
    // Get unassigned faces
    const faces = await prisma.face.findMany({
      where: { personId: null },
      take: 5,
      select: { id: true, photoId: true }
    });
    
    console.log('Unassigned faces:', faces);
    
    if (faces.length > 0) {
      const testFaceId = faces[0].id;
      console.log(`\nTesting with face ID: ${testFaceId}`);
      
      // Test the update query manually
      const result = await prisma.$executeRawUnsafe(
        `UPDATE faces SET personId = ? WHERE id = ? AND personId IS NULL`,
        'test-person-id',
        testFaceId
      );
      
      console.log('Update result:', result);
      
      // Check if it worked
      const updatedFace = await prisma.face.findUnique({
        where: { id: testFaceId },
        select: { id: true, personId: true }
      });
      
      console.log('Updated face:', updatedFace);
      
      // Reset it back
      await prisma.$executeRawUnsafe(
        `UPDATE faces SET personId = NULL WHERE id = ?`,
        testFaceId
      );
      
      console.log('Reset face back to unassigned');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFaceIds();
