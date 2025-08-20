#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addPhotosPerPageSetting() {
  try {
    // Add default photosPerPage setting if it doesn't exist
    await prisma.siteSettings.upsert({
      where: { key: 'photosPerPage' },
      update: {},
      create: { 
        key: 'photosPerPage', 
        value: '32' 
      }
    });

    console.log('✅ Default photosPerPage setting added successfully');
  } catch (error) {
    console.error('❌ Error adding photosPerPage setting:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  addPhotosPerPageSetting();
}
