#!/usr/bin/env tsx

/**
 * Database Status Utility (PostgreSQL)
 * 
 * Shows the current PostgreSQL database configuration and tests the connection
 */

import { getDatabaseConfig, validateDatabaseConfig, buildDatabaseUrl } from '../lib/database-config';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.production' });

async function main() {
  console.log('🔍 Database Configuration Status\n');

  // Show configuration
  const config = getDatabaseConfig();
  console.log('📋 Current Configuration:');
  console.log(`   Provider: PostgreSQL`);
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Password: ${config.hasPassword ? '✅ Set' : '❌ Not set'}`);
  console.log('');

  // Validate configuration
  const validation = validateDatabaseConfig();
  console.log('🔧 Configuration Validation:');
  if (validation.valid) {
    console.log('   ✅ Configuration is valid');
  } else {
    console.log('   ❌ Configuration has errors:');
    validation.errors.forEach(error => {
      console.log(`      - ${error}`);
    });
    return;
  }
  console.log('');

  // Show constructed URL (without password)
  try {
    const url = buildDatabaseUrl();
    const urlWithoutPassword = url.replace(/:[^:@]+@/, ':***@');
    console.log('🔗 Constructed DATABASE_URL:');
    console.log(`   ${urlWithoutPassword}`);
    console.log('');
  } catch (error) {
    console.log('❌ Failed to construct DATABASE_URL:', error);
    return;
  }

  // Test connection
  console.log('🔌 Testing Database Connection...');
  let prisma: PrismaClient | null = null;
  
  try {
    prisma = new PrismaClient();
    
    // Test basic connection
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('   ✅ Connection successful');

    // Test database schema
    try {
      const albumCount = await prisma.album.count();
      const photoCount = await prisma.photo.count();

      console.log('');
      console.log('📊 Database Statistics:');
      console.log(`   Albums: ${albumCount.toLocaleString()}`);
      console.log(`   Photos: ${photoCount.toLocaleString()}`);

    } catch (error) {
      console.log('   ⚠️  Tables not found - database may need migration');
    }

  } catch (error) {
    console.log('   ❌ Connection failed:', error);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }

  console.log('');
  console.log('💡 Tips:');
  console.log('   - Set individual DB_* variables for better security');
  console.log('   - Use DATABASE_URL for quick setup');
  console.log('   - Run "npm run db:push" to apply schema changes');
  console.log('   - Run "npm run db:migrate-to-mariadb" to migrate data');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
