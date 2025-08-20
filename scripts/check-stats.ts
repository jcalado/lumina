#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStats() {
  try {
    const photoCount = await prisma.photo.count();
    const albumCount = await prisma.album.count();
    const photosWithBlurhash = await prisma.photo.count({
      where: { blurhash: { not: null } }
    });

    console.log('📊 Database Statistics:');
    console.log(`   Total photos: ${photoCount}`);
    console.log(`   Total albums: ${albumCount}`);
    console.log(`   Photos with blurhash: ${photosWithBlurhash}/${photoCount}`);
    
    if (photoCount > 32) {
      console.log('✅ Sufficient photos for pagination testing');
    } else {
      console.log('ℹ️  Limited photos - pagination will show single page');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStats();
