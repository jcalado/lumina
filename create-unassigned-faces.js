const { PrismaClient } = require('@prisma/client');

async function createUnassignedFaces() {
  const prisma = new PrismaClient();
  
  try {
    // Unassign faces from John Doe for testing
    const result = await prisma.face.updateMany({
      where: {
        personId: 'cmeq4wmow0000iw5k0k1hxyw5' // John Doe's ID
      },
      data: {
        personId: null
      }
    });
    
    console.log(`Unassigned ${result.count} faces from John Doe for testing`);
    
    // Check total unassigned faces
    const unassignedCount = await prisma.face.count({
      where: {
        personId: null
      }
    });
    
    console.log(`Total unassigned faces: ${unassignedCount}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUnassignedFaces();
