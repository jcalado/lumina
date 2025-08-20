import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();
const prisma = new PrismaClient();

async function deleteOrphanedPhotos() {
  try {
    // Delete the photo that exists in DB but not in S3
    const deletedPhoto = await prisma.photo.delete({
      where: { 
        id: 'cmek13m820004iwk8n25saj78' 
      },
    });

    console.log(`Deleted orphaned photo: ${deletedPhoto.filename}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteOrphanedPhotos();
