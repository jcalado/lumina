import { prisma } from '../lib/prisma';

async function checkFaceStats() {
  console.log('Checking face statistics...');

  try {
    // Count total faces
    const totalFaces = await prisma.face.count();
    console.log(`Total faces: ${totalFaces}`);

    // Count faces with embeddings
    const facesWithEmbeddings = await prisma.face.count({
      where: {
        hasEmbedding: true
      }
    });
    console.log(`Faces with embeddings: ${facesWithEmbeddings}`);

    // Count faces without embeddings
    const facesWithoutEmbeddings = await prisma.face.count({
      where: {
        hasEmbedding: false
      }
    });
    console.log(`Faces without embeddings: ${facesWithoutEmbeddings}`);

    // Count assigned faces (have personId)
    const assignedFaces = await prisma.face.count({
      where: {
        personId: {
          not: null
        }
      }
    });
    console.log(`Assigned faces: ${assignedFaces}`);

    // Count unassigned faces (no personId)
    const unassignedFaces = await prisma.face.count({
      where: {
        personId: null
      }
    });
    console.log(`Unassigned faces: ${unassignedFaces}`);

    // Count ignored faces
    const ignoredFaces = await prisma.face.count({
      where: {
        ignored: true
      }
    });
    console.log(`Ignored faces: ${ignoredFaces}`);

    // Count people
    const totalPeople = await prisma.person.count();
    console.log(`Total people: ${totalPeople}`);

    // Count confirmed people
    const confirmedPeople = await prisma.person.count({
      where: {
        confirmed: true
      }
    });
    console.log(`Confirmed people: ${confirmedPeople}`);

    // Get average faces per person
    const peopleWithFaces = await prisma.person.findMany({
      include: {
        _count: {
          select: { faces: true }
        }
      }
    });

    const avgFacesPerPerson = peopleWithFaces.length > 0
      ? peopleWithFaces.reduce((sum, person) => sum + person._count.faces, 0) / peopleWithFaces.length
      : 0;

    console.log(`Average faces per person: ${avgFacesPerPerson.toFixed(2)}`);

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Database contains:`);
    console.log(`- ${totalFaces} total faces`);
    console.log(`- ${totalPeople} people`);
    console.log(`- ${assignedFaces} faces assigned to people (${((assignedFaces / totalFaces) * 100).toFixed(1)}%)`);
    console.log(`- ${unassignedFaces} unassigned faces (${((unassignedFaces / totalFaces) * 100).toFixed(1)}%)`);
    console.log(`- ${ignoredFaces} ignored faces`);

  } catch (error) {
    console.error('Error checking face stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFaceStats();
