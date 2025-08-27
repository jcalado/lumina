import { PrismaClient } from '@prisma/client';
import { buildDatabaseUrl, validateDatabaseConfig } from './database-config';

// Validate database configuration on startup
const configValidation = validateDatabaseConfig();
if (!configValidation.valid) {
  console.error('Database configuration errors:', configValidation.errors);
  throw new Error(`Invalid database configuration: ${configValidation.errors.join(', ')}`);
}

// Ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
