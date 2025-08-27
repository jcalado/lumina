/**
 * Database Configuration Utility
 * 
 * This utility constructs the DATABASE_URL from individual environment variables
 * for better security and maintainability in production environments.
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
  charset?: string;
  collation?: string;
}

/**
 * Constructs a MariaDB/MySQL connection URL from environment variables
 */
export function buildDatabaseUrl(): string {
  // First, check if DATABASE_URL is already set
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Otherwise, construct from individual components
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    database: process.env.DB_DATABASE || 'lumina_production',
    username: process.env.DB_USERNAME || 'lumina_user',
    password: process.env.DB_PASSWORD || '',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    collation: process.env.DB_COLLATION || 'utf8mb4_unicode_ci'
  };

  // Validate required fields
  if (!config.password) {
    throw new Error('Database password is required. Set DB_PASSWORD environment variable.');
  }

  // Construct the URL
  let url = `mysql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;

  // Add query parameters for charset and collation
  const params = new URLSearchParams();
  if (config.charset) {
    params.append('charset', config.charset);
  }
  if (config.collation) {
    params.append('collation', config.collation);
  }

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  return url;
}

/**
 * Gets the database configuration for display purposes (without password)
 */
export function getDatabaseConfig(): Omit<DatabaseConfig, 'password'> & { hasPassword: boolean } {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '3306',
    database: process.env.DB_DATABASE || 'lumina_production',
    username: process.env.DB_USERNAME || 'lumina_user',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    collation: process.env.DB_COLLATION || 'utf8mb4_unicode_ci',
    hasPassword: !!process.env.DB_PASSWORD
  };
}

/**
 * Validates the database configuration
 */
export function validateDatabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    errors.push('Either DATABASE_URL or DB_PASSWORD must be set');
  }

  if (process.env.DB_PORT && isNaN(parseInt(process.env.DB_PORT))) {
    errors.push('DB_PORT must be a valid number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Set the DATABASE_URL if not already set
if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = buildDatabaseUrl();
  } catch (error) {
    console.warn('Could not construct DATABASE_URL from environment variables:', error);
  }
}
