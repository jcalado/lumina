/**
 * Database Configuration Utility (PostgreSQL only)
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
}

/**
 * Constructs a PostgreSQL connection URL from environment variables
 */
export function buildDatabaseUrl(): string {
  // First, check if DATABASE_URL is already set and is a valid PostgreSQL URL
  if (process.env.DATABASE_URL?.startsWith('postgresql://')) {
    return process.env.DATABASE_URL;
  }

  // Check for required DB variables
  const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;
  
  if (hasDbVariables) {
    console.log('🔧 Building PostgreSQL DATABASE_URL from DB_* environment variables...');
    
    const config: DatabaseConfig = {
      host: process.env.DB_HOST!,
      port: process.env.DB_PORT || '5432',
      database: process.env.DB_DATABASE || 'lumina_production',
      username: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!
    };

    // Construct the PostgreSQL URL
    const url = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}`;

    // Set the constructed URL as environment variable
    process.env.DATABASE_URL = url;
    console.log(`✅ Constructed DATABASE_URL: postgresql://${config.username}:***@${config.host}:${config.port}/${config.database}`);
    
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
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432',
    database: process.env.DB_DATABASE || 'lumina_production',
    username: process.env.DB_USERNAME || 'lumina_user',
    hasPassword: !!process.env.DB_PASSWORD
  };
}

/**
 * Validates the database configuration
 */
export function validateDatabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;
  const hasDbUrl = process.env.DATABASE_URL?.startsWith('postgresql://');

  if (!hasDbUrl && !hasDbVariables) {
    errors.push('Either DATABASE_URL (postgresql://) or DB_* variables (DB_HOST, DB_USERNAME, DB_PASSWORD) must be set');
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
const hasDbVariables = process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD;

if (!process.env.DATABASE_URL && hasDbVariables) {
  try {
    buildDatabaseUrl();
  } catch (error) {
    console.warn('Could not construct DATABASE_URL from environment variables:', error);
  }
}
