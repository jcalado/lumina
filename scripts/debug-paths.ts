#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

(async () => {
  const photo = await prisma.photo.findFirst({
    select: { filename: true, originalPath: true, s3Key: true }
  });
  console.log('Sample photo data:');
  console.log('Filename:', photo?.filename);
  console.log('Original Path:', photo?.originalPath);
  console.log('S3 Key:', photo?.s3Key);
  console.log('PHOTOS_ROOT_PATH:', process.env.PHOTOS_ROOT_PATH);
  
  if (photo?.originalPath) {
    console.log('\nPath analysis:');
    console.log('- Is absolute path:', photo.originalPath.includes(':') || photo.originalPath.startsWith('/'));
    console.log('- Contains backslashes:', photo.originalPath.includes('\\'));
    console.log('- Path length:', photo.originalPath.length);
  }
  
  await prisma.$disconnect();
})();
