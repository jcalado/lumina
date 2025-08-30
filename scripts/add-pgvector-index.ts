#!/usr/bin/env ts-node
import { prisma } from '../lib/prisma';

async function main() {
  // Enable pgvector extension if not already
  await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;

  // Create IVFFlat index on embedding column for cosine similarity
  // Note: This assumes embedding is cast to vector in queries
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS faces_embedding_ivfflat_idx ON faces USING ivfflat ((embedding::vector(512)) vector_cosine_ops) WITH (lists = 100);`;

  console.log('pgvector index created successfully');
}

main().then(() => prisma.$disconnect()).catch(console.error);
