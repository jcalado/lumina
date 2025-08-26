const { PrismaClient } = require('@prisma/client');

async function createPersonFromFaces(name, faceIds) {
  const prisma = new PrismaClient();
  
  try {
    console.log(`Creating person "${name}" with faces:`, faceIds);
    
    // Create the person
    const person = await prisma.person.create({
      data: {
        name: name,
        confirmed: false,
      },
    });
    
    console.log(`Created person: ${person.name} (ID: ${person.id})`);
    
    // Assign faces to the person
    const updateResult = await prisma.face.updateMany({
      where: {
        id: {
          in: faceIds,
        },
        personId: null, // Only update unassigned faces
      },
      data: {
        personId: person.id,
      },
    });
    
    console.log(`Updated ${updateResult.count} faces`);
    
    // Get the updated person with face count
    const updatedPerson = await prisma.person.findUnique({
      where: { id: person.id },
      include: {
        _count: {
          select: {
            faces: true,
          },
        },
      },
    });
    
    console.log(`Person created successfully with ${updatedPerson._count.faces} faces`);
    
    return {
      id: updatedPerson.id,
      name: updatedPerson.name,
      confirmed: updatedPerson.confirmed,
      faceCount: updatedPerson._count.faces,
    };
    
  } catch (error) {
    console.error('Error creating person:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function getUnassignedFaces() {
  const prisma = new PrismaClient();
  
  try {
    const faces = await prisma.face.findMany({
      where: {
        personId: null,
      },
      include: {
        photo: {
          select: {
            id: true,
            filename: true,
          },
        },
      },
      orderBy: {
        confidence: 'desc',
      },
      take: 20,
    });
    
    console.log(`Found ${faces.length} unassigned faces`);
    faces.forEach((face, i) => {
      console.log(`${i + 1}. Face ${face.id} - ${face.photo.filename} (confidence: ${Math.round(face.confidence * 100)}%)`);
    });
    
    return faces;
    
  } catch (error) {
    console.error('Error getting unassigned faces:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { createPersonFromFaces, getUnassignedFaces };
