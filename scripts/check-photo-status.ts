import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

config();
const prisma = new PrismaClient();

async function checkPhotoStatus() {
  try {
    const photos = await prisma.photo.findMany({
      select: {
        id: true,
        filename: true,
        s3Key: true,
        originalPath: true,
      },
    });

    console.log(`Found ${photos.length} photos in database`);

    const photosRootPath = process.env.PHOTOS_ROOT_PATH || '';
    console.log(`Photos root path: ${photosRootPath}`);

    for (const photo of photos.slice(0, 5)) { // Check first 5 photos
      console.log(`\nPhoto: ${photo.filename}`);
      console.log(`S3 Key: ${photo.s3Key}`);
      console.log(`Original Path: ${photo.originalPath}`);
      
      // Check if file exists locally
      if (photo.originalPath && fs.existsSync(photo.originalPath)) {
        const stats = fs.statSync(photo.originalPath);
        console.log(`✓ Local file exists (${stats.size} bytes)`);
      } else {
        console.log('✗ Local file NOT found');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPhotoStatus();
