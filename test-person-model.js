const { PrismaClient } = require('@prisma/client');

async function testPersonModel() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing Person model...');
    
    // Test creating a person
    const person = await prisma.person.create({
      data: {
        name: 'Test Person',
        confirmed: false,
      },
    });
    
    console.log('Created person:', person);
    
    // Test finding the person
    const foundPerson = await prisma.person.findUnique({
      where: { id: person.id },
    });
    
    console.log('Found person:', foundPerson);
    
    // Clean up
    await prisma.person.delete({
      where: { id: person.id },
    });
    
    console.log('Person model works correctly!');
  } catch (error) {
    console.error('Error testing Person model:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPersonModel();
