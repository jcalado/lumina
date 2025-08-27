// Delete every person with only 1 assigned face and unassign their face
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const singleFacePeople = await prisma.person.findMany({
    include: {
      faces: true,
    },
  });

  const toDelete = singleFacePeople.filter(p => p.faces.length === 1);

  for (const person of toDelete) {
    const faceId = person.faces[0]?.id;
    if (faceId) {
      // Unassign the face
      await prisma.face.update({
        where: { id: faceId },
        data: { personId: null },
      });
    }
    // Delete the person
    await prisma.person.delete({
      where: { id: person.id },
    });
    console.log(`Deleted person ${person.id} and unassigned face ${faceId}`);
  }

  console.log(`Done. Deleted ${toDelete.length} people.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
