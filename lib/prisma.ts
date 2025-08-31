import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, validateDatabaseConfig } from './database-config';

// Validate database configuration on startup
const configValidation = validateDatabaseConfig();
if (!configValidation.valid) {
  console.error('Database configuration errors:', configValidation.errors);
  throw new Error(`Invalid database configuration: ${configValidation.errors.join(', ')}`);
}

// Get the database URL (either from env or build it)
const databaseUrl = process.env.DATABASE_URL || buildDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
