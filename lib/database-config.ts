/**
 * Database Configuration Utility (PostgreSQL only via DATABASE_URL)
 * 
 * This utility manages PostgreSQL database configuration through the DATABASE_URL
 * environment variable for better security and simplicity.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Function to load environment variables in order of preference
function loadEnvironmentVariables() {
  const envFiles = [
    '.env.local',
    '.env.production', 
    '.env'
  ];

  // If NODE_ENV is production, prioritize .env.production
  if (process.env.NODE_ENV === 'production') {
    envFiles.unshift('.env.production.local');
  }

  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      console.log(`Loading environment from ${envFile}`);
      dotenv.config({ path: envFile, override: false });
      break;
    }
  }
}

// Load environment variables on module import
loadEnvironmentVariables();

interface DatabaseConfig {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

/**
 * Constructs a PostgreSQL connection URL from environment variables
 */
export function buildDatabaseUrl(): string {
  // During build time, return a placeholder URL
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
  }

  // Check if DATABASE_URL is already set and is a valid PostgreSQL URL
  if (process.env.DATABASE_URL?.startsWith('postgresql://')) {
    return process.env.DATABASE_URL;
  }

  // If DATABASE_URL exists but is not PostgreSQL, return it anyway (for backward compatibility)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error('DATABASE_URL environment variable must be set with a valid PostgreSQL connection string.');
}

/**
 * Gets the database configuration for display purposes (without password)
 */
export function getDatabaseConfig(): Omit<DatabaseConfig, 'password'> & { hasPassword: boolean } {
  // Parse DATABASE_URL to extract components
  if (process.env.DATABASE_URL?.startsWith('postgresql://')) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1), // Remove leading slash
        username: url.username,
        hasPassword: !!url.password
      };
    } catch (error) {
      console.warn('Failed to parse DATABASE_URL:', error);
    }
  }

  // Fallback defaults
  return {
    host: 'localhost',
    port: '5432',
    database: 'lumina_production',
    username: 'lumina_user',
    hasPassword: false
  };
}

/**
 * Validates the database configuration
 */
export function validateDatabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Skip validation during build time (when NEXT_PHASE is defined)
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { valid: true, errors: [] };
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL environment variable must be set');
  } else if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string (starting with postgresql://)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Database configuration is now handled entirely through DATABASE_URL
// No additional initialization needed
