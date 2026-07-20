import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl, validateDatabaseConfig } from './database-config';

/**
 * Creates a PrismaClient wired to the PostgreSQL driver adapter.
 *
 * Prisma 7 removed the bundled query engine — a driver adapter is now
 * mandatory, and the `datasources` constructor option no longer exists.
 * All PrismaClient instances (the app singleton in ./prisma.ts, the seed
 * script and the standalone scripts/*) must go through this factory.
 */
export function createPrismaClient(): PrismaClient {
  const configValidation = validateDatabaseConfig();
  if (!configValidation.valid) {
    console.error('Database configuration errors:', configValidation.errors);
    throw new Error(
      `Invalid database configuration: ${configValidation.errors.join(', ')}`
    );
  }

  // Get the database URL (either from env or build it)
  const databaseUrl = process.env.DATABASE_URL || buildDatabaseUrl();

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
