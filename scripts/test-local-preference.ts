#!/usr/bin/env tsx

import { createPrismaClient } from '../lib/prisma-client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = createPrismaClient();

async function testLocalFilePreference() {
  console.log('🧪 Testing local file preference for blurhash worker...\n');

  try {
    // Find a photo that currently has a blurhash
    const photo = await prisma.photo.findFirst({
      where: {
        blurhash: { not: null },
      },
      select: {
        id: true,
        filename: true,
        s3Key: true,
        blurhash: true,
      },
    });

    if (!photo) {
      console.log('❌ No photos with blurhash found for testing');
      return;
    }

    console.log(`📸 Selected photo for test: ${photo.filename}`);
    console.log(`🔑 S3 key: ${photo.s3Key}`);
    console.log(`🎨 Current blurhash: ${photo.blurhash?.substring(0, 20)}...`);

    // Temporarily remove the blurhash
    console.log('\n🔄 Temporarily removing blurhash to test regeneration...');
    await prisma.photo.update({
      where: { id: photo.id },
      data: { blurhash: null },
    });

    console.log('✅ Blurhash removed. Now run the blurhash worker to test:');
    console.log('   npx tsx scripts/blurhash-worker.ts');
    console.log('\n💡 The worker should prefer the local file if available!');
    console.log('\n🔧 To restore the original blurhash without running the worker:');
    console.log(`   UPDATE photos SET blurhash = '${photo.blurhash}' WHERE id = '${photo.id}';`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLocalFilePreference();
