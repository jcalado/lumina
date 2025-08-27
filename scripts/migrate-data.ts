import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Data Migration Utility: SQLite to MariaDB
 * 
 * This script helps migrate existing data from SQLite to MariaDB.
 * Run this after setting up the MariaDB database structure.
 */

interface MigrationConfig {
  sqliteDbPath: string;
  mariadbUrl: string;
  batchSize: number;
}

class DataMigrator {
  private sqlitePrisma: PrismaClient;
  private mariadbPrisma: PrismaClient;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    
    // SQLite connection
    this.sqlitePrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${config.sqliteDbPath}`
        }
      }
    });

    // MariaDB connection
    this.mariadbPrisma = new PrismaClient({
      datasources: {
        db: {
          url: config.mariadbUrl
        }
      }
    });
  }

  async migrate() {
    console.log('🚀 Starting data migration from SQLite to MariaDB...');

    try {
      // Test connections
      await this.testConnections();

      // Migrate in order of dependencies
      await this.migrateAdminUsers();
      await this.migrateSiteSettings();
      await this.migrateAlbums();
      await this.migratePhotos();
      await this.migrateVideos();
      await this.migrateThumbnails();
      await this.migrateVideoThumbnails();
      await this.migratePeople();
      await this.migrateFaces();
      await this.migrateJobs();

      console.log('✅ Data migration completed successfully!');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await this.sqlitePrisma.$disconnect();
      await this.mariadbPrisma.$disconnect();
    }
  }

  private async testConnections() {
    console.log('🔍 Testing database connections...');
    
    try {
      await this.sqlitePrisma.$queryRaw`SELECT 1`;
      console.log('✅ SQLite connection successful');
    } catch (error) {
      throw new Error(`SQLite connection failed: ${error}`);
    }

    try {
      await this.mariadbPrisma.$queryRaw`SELECT 1`;
      console.log('✅ MariaDB connection successful');
    } catch (error) {
      throw new Error(`MariaDB connection failed: ${error}`);
    }
  }

  private async migrateAdminUsers() {
    console.log('📝 Migrating admin users...');
    
    const users = await this.sqlitePrisma.adminUser.findMany();
    
    for (const user of users) {
      await this.mariadbPrisma.adminUser.upsert({
        where: { id: user.id },
        update: user,
        create: user
      });
    }
    
    console.log(`✅ Migrated ${users.length} admin users`);
  }

  private async migrateSiteSettings() {
    console.log('📝 Migrating site settings...');
    
    const settings = await this.sqlitePrisma.siteSettings.findMany();
    
    for (const setting of settings) {
      await this.mariadbPrisma.siteSettings.upsert({
        where: { id: setting.id },
        update: setting,
        create: setting
      });
    }
    
    console.log(`✅ Migrated ${settings.length} site settings`);
  }

  private async migrateAlbums() {
    console.log('📝 Migrating albums...');
    
    const albums = await this.sqlitePrisma.album.findMany();
    
    for (const album of albums) {
      await this.mariadbPrisma.album.upsert({
        where: { id: album.id },
        update: album,
        create: album
      });
    }
    
    console.log(`✅ Migrated ${albums.length} albums`);
  }

  private async migratePhotos() {
    console.log('📝 Migrating photos...');
    
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      const photos = await this.sqlitePrisma.photo.findMany({
        skip: offset,
        take: this.config.batchSize
      });

      if (photos.length === 0) break;

      for (const photo of photos) {
        await this.mariadbPrisma.photo.upsert({
          where: { id: photo.id },
          update: photo,
          create: photo
        });
      }

      totalMigrated += photos.length;
      offset += this.config.batchSize;
      console.log(`   📸 Migrated ${totalMigrated} photos so far...`);
    }
    
    console.log(`✅ Migrated ${totalMigrated} photos total`);
  }

  private async migrateVideos() {
    console.log('📝 Migrating videos...');
    
    const videos = await this.sqlitePrisma.video.findMany();
    
    for (const video of videos) {
      await this.mariadbPrisma.video.upsert({
        where: { id: video.id },
        update: video,
        create: video
      });
    }
    
    console.log(`✅ Migrated ${videos.length} videos`);
  }

  private async migrateThumbnails() {
    console.log('📝 Migrating photo thumbnails...');
    
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      const thumbnails = await this.sqlitePrisma.thumbnail.findMany({
        skip: offset,
        take: this.config.batchSize
      });

      if (thumbnails.length === 0) break;

      for (const thumbnail of thumbnails) {
        await this.mariadbPrisma.thumbnail.upsert({
          where: { id: thumbnail.id },
          update: thumbnail,
          create: thumbnail
        });
      }

      totalMigrated += thumbnails.length;
      offset += this.config.batchSize;
      console.log(`   🖼️ Migrated ${totalMigrated} thumbnails so far...`);
    }
    
    console.log(`✅ Migrated ${totalMigrated} thumbnails total`);
  }

  private async migrateVideoThumbnails() {
    console.log('📝 Migrating video thumbnails...');
    
    const videoThumbnails = await this.sqlitePrisma.videoThumbnail.findMany();
    
    for (const thumbnail of videoThumbnails) {
      await this.mariadbPrisma.videoThumbnail.upsert({
        where: { id: thumbnail.id },
        update: thumbnail,
        create: thumbnail
      });
    }
    
    console.log(`✅ Migrated ${videoThumbnails.length} video thumbnails`);
  }

  private async migratePeople() {
    console.log('📝 Migrating people...');
    
    const people = await this.sqlitePrisma.person.findMany();
    
    for (const person of people) {
      await this.mariadbPrisma.person.upsert({
        where: { id: person.id },
        update: person,
        create: person
      });
    }
    
    console.log(`✅ Migrated ${people.length} people`);
  }

  private async migrateFaces() {
    console.log('📝 Migrating faces...');
    
    let offset = 0;
    let totalMigrated = 0;

    while (true) {
      const faces = await this.sqlitePrisma.face.findMany({
        skip: offset,
        take: this.config.batchSize
      });

      if (faces.length === 0) break;

      for (const face of faces) {
        await this.mariadbPrisma.face.upsert({
          where: { id: face.id },
          update: face,
          create: face
        });
      }

      totalMigrated += faces.length;
      offset += this.config.batchSize;
      console.log(`   👤 Migrated ${totalMigrated} faces so far...`);
    }
    
    console.log(`✅ Migrated ${totalMigrated} faces total`);
  }

  private async migrateJobs() {
    console.log('📝 Migrating job records...');
    
    // Migrate sync jobs
    const syncJobs = await this.sqlitePrisma.syncJob.findMany();
    for (const job of syncJobs) {
      await this.mariadbPrisma.syncJob.upsert({
        where: { id: job.id },
        update: job,
        create: job
      });
    }

    // Migrate blurhash jobs
    const blurhashJobs = await this.sqlitePrisma.blurhashJob.findMany();
    for (const job of blurhashJobs) {
      await this.mariadbPrisma.blurhashJob.upsert({
        where: { id: job.id },
        update: job,
        create: job
      });
    }

    // Migrate thumbnail jobs
    const thumbnailJobs = await this.sqlitePrisma.thumbnailJob.findMany();
    for (const job of thumbnailJobs) {
      await this.mariadbPrisma.thumbnailJob.upsert({
        where: { id: job.id },
        update: job,
        create: job
      });
    }

    // Migrate face recognition jobs
    const faceJobs = await this.sqlitePrisma.faceRecognitionJob.findMany();
    for (const job of faceJobs) {
      await this.mariadbPrisma.faceRecognitionJob.upsert({
        where: { id: job.id },
        update: job,
        create: job
      });
    }
    
    const totalJobs = syncJobs.length + blurhashJobs.length + thumbnailJobs.length + faceJobs.length;
    console.log(`✅ Migrated ${totalJobs} job records`);
  }
}

// Main execution
async function main() {
  const config: MigrationConfig = {
    sqliteDbPath: process.env.SQLITE_DB_PATH || './prisma/dev.db',
    mariadbUrl: process.env.DATABASE_URL || 'mysql://lumina_user:password@localhost:3306/lumina_production',
    batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '100')
  };

  console.log('Configuration:', {
    sqliteDbPath: config.sqliteDbPath,
    mariadbUrl: config.mariadbUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Hide credentials
    batchSize: config.batchSize
  });

  if (!fs.existsSync(config.sqliteDbPath)) {
    console.error(`❌ SQLite database not found at: ${config.sqliteDbPath}`);
    process.exit(1);
  }

  const migrator = new DataMigrator(config);
  await migrator.migrate();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

export { DataMigrator };
export type { MigrationConfig };
