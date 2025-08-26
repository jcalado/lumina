const { PrismaClient } = require('@prisma/client');

async function createPeopleAndAssignFaces() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== Creating People and Assigning Faces ===');
    
    // Get all unassigned faces
    const unassignedFaces = await prisma.face.findMany({
      where: { personId: null },
      include: {
        photo: {
          select: { filename: true }
        }
      }
    });
    
    console.log(`Found ${unassignedFaces.length} unassigned faces`);
    
    if (unassignedFaces.length === 0) {
      console.log('No unassigned faces to process');
      return;
    }
    
    // Create some people
    const peopleNames = ['John Doe', 'Jane Smith', 'Alex Johnson', 'Sarah Wilson'];
    const createdPeople = [];
    
    for (const name of peopleNames) {
      const person = await prisma.person.create({
        data: {
          name,
          confirmed: false,
        }
      });
      createdPeople.push(person);
      console.log(`Created person: ${name} (ID: ${person.id})`);
    }
    
    // Assign faces to people randomly
    let assignedCount = 0;
    for (const face of unassignedFaces) {
      // Randomly assign to one of the created people
      const randomPerson = createdPeople[Math.floor(Math.random() * createdPeople.length)];
      
      await prisma.face.update({
        where: { id: face.id },
        data: { personId: randomPerson.id }
      });
      
      assignedCount++;
      console.log(`Assigned face from ${face.photo.filename} to ${randomPerson.name}`);
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Created ${createdPeople.length} people`);
    console.log(`Assigned ${assignedCount} faces`);
    
    // Show final stats
    const totalPeople = await prisma.person.count();
    const totalFaces = await prisma.face.count();
    const assignedFaces = await prisma.face.count({ where: { personId: { not: null } } });
    
    console.log(`\nFinal stats:`);
    console.log(`Total people: ${totalPeople}`);
    console.log(`Total faces: ${totalFaces}`);
    console.log(`Assigned faces: ${assignedFaces}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createPeopleAndAssignFaces();
