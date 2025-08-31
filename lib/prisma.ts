import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, validateDatabaseConfig } from './database-config';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaInstance: PrismaClient;

// During build time, skip database validation and use a minimal setup
// if (process.env.NEXT_PHASE === 'phase-production-build') {
//   // Use a mock PrismaClient during build that won't try to connect
//   prismaInstance = globalForPrisma.prisma ?? new PrismaClient({
//     datasources: {
//       db: {
//         url: 'postgresql://placeholder:placeholder@localhost:5432/placeholder'
//       }
//     }
//   });
// } else {
  // Runtime initialization with proper validation
  const configValidation = validateDatabaseConfig();
  if (!configValidation.valid) {
    console.error('Database configuration errors:', configValidation.errors);
    throw new Error(`Invalid database configuration: ${configValidation.errors.join(', ')}`);
  }

  // Get the database URL (either from env or build it)
  const databaseUrl = process.env.DATABASE_URL || buildDatabaseUrl();

  prismaInstance = globalForPrisma.prisma ?? new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
// }

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;

export const prisma = prismaInstance;
