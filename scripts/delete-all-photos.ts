import { config } from 'dotenv';
import { createPrismaClient } from '../lib/prisma-client';

config();
const prisma = createPrismaClient();

async function deleteAllPhotos() {
  try {
    const deletedPhotos = await prisma.photo.deleteMany({});
    console.log(`Deleted ${deletedPhotos.count} photos from database`);

    const deletedThumbnails = await prisma.thumbnail.deleteMany({});
    console.log(`Deleted ${deletedThumbnails.count} thumbnails from database`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllPhotos();
