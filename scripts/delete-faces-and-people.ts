import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Deleting all Face records...');
    await prisma.face.deleteMany({});
    console.log('All Face records deleted.');

    console.log('Deleting all Person records...');
    await prisma.person.deleteMany({});
    console.log('All Person records deleted.');

    console.log('Database cleanup complete.');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
