import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkDatabaseEntries() {
  try {
    console.log('🗄️  Checking Database Entries');
    console.log('=============================');
    
    console.log('Albums:');
    const albums = await prisma.album.findMany({
      include: {
        photos: true,
      },
    });
    
    albums.forEach((album, index) => {
      console.log(`${index + 1}. "${album.name}" (Path: ${album.path})`);
      console.log(`   Status: ${album.status}, Enabled: ${album.enabled}`);
      console.log(`   Photos: ${album.photos.length}`);
      
      album.photos.forEach((photo, photoIndex) => {
        console.log(`     ${photoIndex + 1}. ${photo.filename}`);
        console.log(`        S3 Key: ${photo.s3Key}`);
        console.log(`        Original Path: ${photo.originalPath}`);
        console.log(`        Size: ${Math.round(photo.fileSize / 1024)}KB`);
      });
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseEntries();
