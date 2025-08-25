const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testModels() {
  try {
    console.log('Testing Person model...');
    const personCount = await prisma.person.count();
    console.log(`Person count: ${personCount}`);
    
    console.log('Testing Face model...');
    const faceCount = await prisma.face.count();
    console.log(`Face count: ${faceCount}`);
    
    console.log('All models accessible!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testModels();
