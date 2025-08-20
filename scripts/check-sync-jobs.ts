import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();
const prisma = new PrismaClient();

async function checkSyncJobs() {
  try {
    const syncJobs = await prisma.syncJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    console.log(`Found ${syncJobs.length} sync jobs:`);
    
    for (const job of syncJobs) {
      console.log(`\nSync Job ${job.id}:`);
      console.log(`Status: ${job.status}`);
      console.log(`Created: ${job.createdAt}`);
      console.log(`Started: ${job.startedAt}`);
      console.log(`Completed: ${job.completedAt}`);
      if (job.error) {
        console.log(`Error: ${job.error}`);
      }
      console.log(`Files processed: ${job.filesProcessed}`);
      console.log(`Files uploaded: ${job.filesUploaded}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSyncJobs();
