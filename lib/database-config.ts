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
  // First, check if DATABASE_URL is already set and is a valid DB URL
  if (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('mysql://') || process.env.DATABASE_URL.startsWith('postgresql://'))) {
    return process.env.DATABASE_URL;
  }

  // If DATABASE_URL is set but it's SQLite and we have DB_* variables, prefer DB_* variables
  const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;
  
  if (hasDbVariables) {
    console.log('🔧 Building DATABASE_URL from DB_* environment variables...');
    
    const isPostgres = process.env.DATABASE_URL?.startsWith('postgresql://') || process.env.DB_TYPE === 'postgres';
    const config: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || (isPostgres ? '5432' : '3306'),
      database: process.env.DB_DATABASE || 'lumina_production',
      username: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!,
      charset: process.env.DB_CHARSET || 'utf8mb4',
      collation: process.env.DB_COLLATION || 'utf8mb4_unicode_ci'
    };

    // Construct the URL
    const protocol = isPostgres ? 'postgresql' : 'mysql';
    let url = `${protocol}://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;

    // Add query parameters for charset and collation (for MySQL)
    if (!isPostgres) {
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
    }

    // Set the constructed URL as environment variable
    process.env.DATABASE_URL = url;
    console.log(`✅ Constructed DATABASE_URL: ${protocol}://${config.username}:***@${config.host}:${config.port}/${config.database}`);
    
    return url;
  }

  // Fallback: return existing DATABASE_URL or throw error
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error('No valid database configuration found. Set either DATABASE_URL or DB_* environment variables.');
}

/**
 * Gets the database configuration for display purposes (without password)
 */
export function getDatabaseConfig(): Omit<DatabaseConfig, 'password'> & { hasPassword: boolean } {
  const isPostgres = process.env.DATABASE_URL?.startsWith('postgresql://') || process.env.DB_TYPE === 'postgres';
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || (isPostgres ? '5432' : '3306'),
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

  const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;
  const hasDbUrl = process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('mysql://') || process.env.DATABASE_URL.startsWith('postgresql://'));

  if (!hasDbUrl && !hasDbVariables) {
    errors.push('Either DATABASE_URL (mysql:// or postgresql://) or DB_* variables (DB_HOST, DB_USERNAME, DB_PASSWORD) must be set');
  }

  if (process.env.DB_PORT && isNaN(parseInt(process.env.DB_PORT))) {
    errors.push('DB_PORT must be a valid number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Set the DATABASE_URL if not already set or if it's SQLite but we have DB_* variables
const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;
const isSqliteUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:');

if (!process.env.DATABASE_URL || (isSqliteUrl && hasDbVariables)) {
  try {
    buildDatabaseUrl();
  } catch (error) {
    console.warn('Could not construct DATABASE_URL from environment variables:', error);
  }
}
