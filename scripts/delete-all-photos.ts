import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();
const prisma = new PrismaClient();

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
