const { PrismaClient } = require('@prisma/client');

async function checkFaceData() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== Face Recognition Debug ===');
    
    // Count faces
    const faceCount = await prisma.face.count();
    console.log(`Total faces in database: ${faceCount}`);
    
    // Count people
    const personCount = await prisma.person.count();
    console.log(`Total people in database: ${personCount}`);
    
    // Get sample faces
    const faces = await prisma.face.findMany({
      take: 5,
      include: {
        photo: {
          select: { filename: true }
        },
        person: {
          select: { name: true }
        }
      }
    });
    
    console.log('\n=== Sample Faces ===');
    faces.forEach((face, i) => {
      console.log(`Face ${i + 1}:`);
      console.log(`  Photo: ${face.photo.filename}`);
      console.log(`  Person: ${face.person?.name || 'Unassigned'}`);
      console.log(`  Confidence: ${face.confidence}`);
      console.log(`  Bounding Box: ${face.boundingBox}`);
    });
    
    // Check if there are unassigned faces (faces without people)
    const unassignedFaces = await prisma.face.count({
      where: { personId: null }
    });
    console.log(`\nUnassigned faces: ${unassignedFaces}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFaceData();
