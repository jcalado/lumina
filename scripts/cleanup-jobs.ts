#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

(async () => {
  const jobs = await prisma.blurhashJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, status: true, createdAt: true, processedPhotos: true, totalPhotos: true }
  });
  console.log('Recent jobs:');
  jobs.forEach(job => console.log(`${job.id.slice(-8)}: ${job.status} (${job.processedPhotos}/${job.totalPhotos})`));
  
  // Fix any stuck running jobs
  const runningJobs = await prisma.blurhashJob.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, startedAt: true }
  });
  
  if (runningJobs.length > 0) {
    console.log('\nFound stuck running jobs, marking as failed:');
    for (const job of runningJobs) {
      console.log(`- ${job.id.slice(-8)}`);
      await prisma.blurhashJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errors: JSON.stringify(['Job marked as failed due to cleanup']),
        },
      });
    }
    console.log('✅ Cleanup complete');
  }
  
  await prisma.$disconnect();
})();
