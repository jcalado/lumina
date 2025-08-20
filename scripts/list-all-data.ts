import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();
const prisma = new PrismaClient();

async function listAllPhotos() {
  try {
    const photos = await prisma.photo.findMany({
      select: {
        id: true,
        filename: true,
        s3Key: true,
        albumId: true,
      },
    });

    console.log(`Found ${photos.length} photos in database:`);
    photos.forEach(photo => {
      console.log(`- ${photo.filename} (ID: ${photo.id}, Album: ${photo.albumId})`);
    });

    const albums = await prisma.album.findMany({
      select: {
        id: true,
        name: true,
        path: true,
      },
    });

    console.log(`\nFound ${albums.length} albums in database:`);
    albums.forEach(album => {
      console.log(`- ${album.name} (ID: ${album.id}, Path: ${album.path})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listAllPhotos();
