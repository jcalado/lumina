#!/usr/bin/env ts-node
import { prisma } from '../lib/prisma';

async function checkIndex() {
  const indexes = await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE tablename = 'faces' AND indexname LIKE '%embedding%';`;
  console.log('Embedding indexes:', indexes);

  // Also check if vector extension is enabled
  const extensions = await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname = 'vector';`;
  console.log('Vector extension:', extensions);

  // Check face counts
  const totalFaces = await prisma.face.count();
  const highConfFaces = await prisma.face.count({ where: { personId: { not: null }, confidence: { gt: 0.5 } } });
  const unassignedFaces = await prisma.face.count({ where: { personId: null } });
  console.log(`Total faces: ${totalFaces}, High confidence assigned: ${highConfFaces}, Unassigned: ${unassignedFaces}`);
}

checkIndex().then(() => prisma.$disconnect());
