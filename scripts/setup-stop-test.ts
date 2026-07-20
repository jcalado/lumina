#!/usr/bin/env tsx

import { createPrismaClient } from '../lib/prisma-client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = createPrismaClient();

async function setupStopTest() {
  console.log('🧪 Setting up test for stop functionality...\n');

  try {
    // Remove blurhashes from 5 photos to create test work
    const photos = await prisma.photo.findMany({
      where: {
        blurhash: { not: null },
      },
      take: 5,
      select: {
        id: true,
        filename: true,
        blurhash: true,
      },
    });

    if (photos.length === 0) {
      console.log('❌ No photos with blurhash found for testing');
      return;
    }

    console.log(`📸 Removing blurhashes from ${photos.length} photos to create test work:`);
    
    for (const photo of photos) {
      console.log(`   - ${photo.filename}`);
    }

    // Remove blurhashes
    await prisma.photo.updateMany({
      where: {
        id: { in: photos.map(p => p.id) },
      },
      data: {
        blurhash: null,
      },
    });

    console.log('\n✅ Test setup complete!');
    console.log('\n🔧 Now you can:');
    console.log('1. Go to the Jobs panel in the admin dashboard');
    console.log('2. Start the blurhash processing job');
    console.log('3. While it\'s running, test the stop button');
    console.log('\n🌐 Jobs panel: http://localhost:3001/admin/jobs');

    // Save the original blurhashes for restoration
    const restoreCommands = photos.map(photo => 
      `UPDATE photos SET blurhash = '${photo.blurhash}' WHERE id = '${photo.id}';`
    ).join('\n');

    console.log('\n📝 To restore original blurhashes (if needed):');
    console.log(restoreCommands);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupStopTest();
