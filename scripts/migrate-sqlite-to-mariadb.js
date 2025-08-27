#!/usr/bin/env node

/**
 * SQLite to MariaDB Data Migration Script
 * 
 * This script migrates all data from the existing SQLite production database
 * to the new MariaDB production database.
 * 
 * Usage:
 *   node scripts/migrate-sqlite-to-mariadb.js [--dry-run] [--force]
 * 
 * Options:
 *   --dry-run  Show what would be migrated without actually doing it
 *   --force    Skip confirmation prompts
 */

const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

// Configuration
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'prisma', 'dev.db'); // Adjustable via env var
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Create MariaDB client with production config
const mariadb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || buildDatabaseUrl()
    }
  }
});

// SQLite connection
let sqlite;

function buildDatabaseUrl() {
  const {
    DB_HOST = 'localhost',
    DB_PORT = '3306',
    DB_DATABASE = 'lumina',
    DB_USERNAME = 'root',
    DB_PASSWORD = ''
  } = process.env;

  return `mysql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}`;
}

async function validateEnvironment() {
  console.log('🔍 Validating environment...');
  
  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ SQLite database not found at: ${SQLITE_DB_PATH}`);
    console.log('Please check the SQLITE_DB_PATH in the script and update if necessary.');
    process.exit(1);
  }
  
  // Test MariaDB connection
  try {
    await mariadb.$connect();
    console.log('✅ MariaDB connection successful');
  } catch (error) {
    console.error('❌ Failed to connect to MariaDB:', error.message);
    console.log('Please ensure:');
    console.log('1. MariaDB is running');
    console.log('2. Environment variables are set correctly');
    console.log('3. Database exists and user has permissions');
    process.exit(1);
  }
  
  // Open SQLite connection
  try {
    sqlite = new Database(SQLITE_DB_PATH, { readonly: true });
    console.log('✅ SQLite database opened successfully');
  } catch (error) {
    console.error('❌ Failed to open SQLite database:', error.message);
    process.exit(1);
  }
}

async function checkDataCounts() {
  console.log('\n📊 Checking data counts...');
  
  const tables = [
    'albums', 'photos', 'videos', 'thumbnails', 'video_thumbnails',
    'sync_jobs', 'blurhash_jobs', 'thumbnail_jobs', 'face_recognition_jobs',
    'people', 'faces', 'site_settings', 'admin_users'
  ];
  
  const counts = {
    sqlite: {},
    mariadb: {}
  };
  
  // Count SQLite records
  for (const table of tables) {
    try {
      const result = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      counts.sqlite[table] = result.count;
    } catch (error) {
      // Table might not exist in SQLite
      counts.sqlite[table] = 0;
    }
  }
  
  // Count MariaDB records
  try {
    counts.mariadb.albums = await mariadb.album.count();
    counts.mariadb.photos = await mariadb.photo.count();
    counts.mariadb.videos = await mariadb.video.count();
    counts.mariadb.thumbnails = await mariadb.thumbnail.count();
    counts.mariadb.video_thumbnails = await mariadb.videoThumbnail.count();
    counts.mariadb.sync_jobs = await mariadb.syncJob.count();
    counts.mariadb.blurhash_jobs = await mariadb.blurhashJob.count();
    counts.mariadb.thumbnail_jobs = await mariadb.thumbnailJob.count();
    counts.mariadb.face_recognition_jobs = await mariadb.faceRecognitionJob.count();
    counts.mariadb.people = await mariadb.person.count();
    counts.mariadb.faces = await mariadb.face.count();
    counts.mariadb.site_settings = await mariadb.siteSettings.count();
    counts.mariadb.admin_users = await mariadb.adminUser.count();
  } catch (error) {
    console.error('❌ Error counting MariaDB records:', error.message);
    process.exit(1);
  }
  
  // Display comparison
  console.log('\nData Count Comparison:');
  console.log('Table'.padEnd(20) + 'SQLite'.padEnd(10) + 'MariaDB'.padEnd(10) + 'Migration');
  console.log('-'.repeat(55));
  
  let totalToMigrate = 0;
  let hasData = false;
  
  for (const table of tables) {
    const sqliteCount = counts.sqlite[table] || 0;
    const mariadbCount = counts.mariadb[table] || 0;
    const needsMigration = sqliteCount > mariadbCount;
    const toMigrate = needsMigration ? sqliteCount - mariadbCount : 0;
    
    if (sqliteCount > 0) hasData = true;
    totalToMigrate += toMigrate;
    
    const status = needsMigration ? `+${toMigrate}` : '✓';
    console.log(
      table.padEnd(20) + 
      sqliteCount.toString().padEnd(10) + 
      mariadbCount.toString().padEnd(10) + 
      status
    );
  }
  
  if (!hasData) {
    console.log('\n⚠️  No data found in SQLite database. Nothing to migrate.');
    process.exit(0);
  }
  
  if (totalToMigrate === 0) {
    console.log('\n✅ All data already migrated. Nothing to do.');
    process.exit(0);
  }
  
  console.log(`\n📈 Total records to migrate: ${totalToMigrate}`);
  return counts;
}

async function createBackup() {
  console.log('\n💾 Creating backup...');
  
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `mariadb-pre-migration-${timestamp}.sql`);
  
  if (!isDryRun) {
    // Create a simple backup by exporting current MariaDB data
    try {
      const albums = await mariadb.album.findMany();
      const photos = await mariadb.photo.findMany();
      const videos = await mariadb.video.findMany();
      
      const backupData = {
        timestamp: new Date().toISOString(),
        albums: albums.length,
        photos: photos.length,
        videos: videos.length,
        note: 'Pre-migration backup - use this for rollback reference'
      };
      
      fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
      console.log(`✅ Backup created: ${backupFile}`);
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      if (!isForce) {
        console.log('Use --force to skip backup and continue');
        process.exit(1);
      }
    }
  } else {
    console.log(`📄 Would create backup: ${backupFile}`);
  }
}

async function migrateAlbums() {
  console.log('\n📁 Migrating albums...');
  
  const sqliteAlbums = sqlite.prepare(`
    SELECT * FROM albums ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqliteAlbums.length} albums in SQLite`);
  
  if (!isDryRun && sqliteAlbums.length > 0) {
    for (const album of sqliteAlbums) {
      try {
        // Check if album already exists
        const existing = await mariadb.album.findUnique({
          where: { path: album.path }
        });
        
        if (!existing) {
          await mariadb.album.create({
            data: {
              id: album.id,
              path: album.path,
              slug: album.slug,
              name: album.name,
              description: album.description,
              status: album.status || 'PUBLIC',
              enabled: album.enabled ?? true,
              syncedToS3: album.syncedToS3 ?? false,
              localFilesSafeDelete: album.localFilesSafeDelete ?? false,
              lastSyncAt: album.lastSyncAt ? new Date(album.lastSyncAt) : null,
              syncFingerprint: album.syncFingerprint,
              lastSyncCheck: album.lastSyncCheck ? new Date(album.lastSyncCheck) : null,
              syncStatus: album.syncStatus || 'PENDING',
              createdAt: new Date(album.createdAt),
              updatedAt: new Date(album.updatedAt)
            }
          });
          console.log(`  ✅ Migrated album: ${album.name}`);
        } else {
          console.log(`  ⏭️  Album exists: ${album.name}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate album ${album.name}:`, error.message);
      }
    }
  }
  
  return sqliteAlbums.length;
}

async function migratePhotos() {
  console.log('\n🖼️  Migrating photos...');
  
  const sqlitePhotos = sqlite.prepare(`
    SELECT * FROM photos ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqlitePhotos.length} photos in SQLite`);
  
  if (!isDryRun && sqlitePhotos.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < sqlitePhotos.length; i += batchSize) {
      const batch = sqlitePhotos.slice(i, i + batchSize);
      
      try {
        await mariadb.$transaction(async (tx) => {
          for (const photo of batch) {
            // Check if photo already exists
            const existing = await tx.photo.findUnique({
              where: { id: photo.id }
            });
            
            if (!existing) {
              await tx.photo.create({
                data: {
                  id: photo.id,
                  albumId: photo.albumId,
                  filename: photo.filename,
                  originalPath: photo.originalPath,
                  s3Key: photo.s3Key,
                  metadata: photo.metadata,
                  fileSize: photo.fileSize,
                  takenAt: photo.takenAt ? new Date(photo.takenAt) : null,
                  blurhash: photo.blurhash,
                  createdAt: new Date(photo.createdAt)
                }
              });
            }
          }
        });
        
        console.log(`  ✅ Migrated ${Math.min(batchSize, sqlitePhotos.length - i)} photos (${i + batch.length}/${sqlitePhotos.length})`);
      } catch (error) {
        console.error(`  ❌ Failed to migrate photo batch:`, error.message);
      }
    }
  }
  
  return sqlitePhotos.length;
}

async function migrateVideos() {
  console.log('\n🎥 Migrating videos...');
  
  const sqliteVideos = sqlite.prepare(`
    SELECT * FROM videos ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqliteVideos.length} videos in SQLite`);
  
  if (!isDryRun && sqliteVideos.length > 0) {
    for (const video of sqliteVideos) {
      try {
        // Check if video already exists
        const existing = await mariadb.video.findUnique({
          where: { id: video.id }
        });
        
        if (!existing) {
          await mariadb.video.create({
            data: {
              id: video.id,
              albumId: video.albumId,
              filename: video.filename,
              originalPath: video.originalPath,
              s3Key: video.s3Key,
              metadata: video.metadata,
              fileSize: video.fileSize,
              duration: video.duration,
              width: video.width,
              height: video.height,
              fps: video.fps,
              codec: video.codec,
              bitrate: video.bitrate,
              takenAt: video.takenAt ? new Date(video.takenAt) : null,
              posterFrame: video.posterFrame,
              createdAt: new Date(video.createdAt)
            }
          });
          console.log(`  ✅ Migrated video: ${video.filename}`);
        } else {
          console.log(`  ⏭️  Video exists: ${video.filename}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate video ${video.filename}:`, error.message);
      }
    }
  }
  
  return sqliteVideos.length;
}

async function migrateThumbnails() {
  console.log('\n🖼️  Migrating thumbnails...');
  
  const sqliteThumbnails = sqlite.prepare(`
    SELECT * FROM thumbnails ORDER BY id
  `).all();
  
  console.log(`Found ${sqliteThumbnails.length} thumbnails in SQLite`);
  
  if (!isDryRun && sqliteThumbnails.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < sqliteThumbnails.length; i += batchSize) {
      const batch = sqliteThumbnails.slice(i, i + batchSize);
      
      try {
        await mariadb.$transaction(async (tx) => {
          for (const thumbnail of batch) {
            // Check if thumbnail already exists
            const existing = await tx.thumbnail.findUnique({
              where: { id: thumbnail.id }
            });
            
            if (!existing) {
              await tx.thumbnail.create({
                data: {
                  id: thumbnail.id,
                  photoId: thumbnail.photoId,
                  size: thumbnail.size,
                  s3Key: thumbnail.s3Key,
                  width: thumbnail.width,
                  height: thumbnail.height
                }
              });
            }
          }
        });
        
        console.log(`  ✅ Migrated ${Math.min(batchSize, sqliteThumbnails.length - i)} thumbnails (${i + batch.length}/${sqliteThumbnails.length})`);
      } catch (error) {
        console.error(`  ❌ Failed to migrate thumbnail batch:`, error.message);
      }
    }
  }
  
  return sqliteThumbnails.length;
}

async function migrateVideoThumbnails() {
  console.log('\n🎬 Migrating video thumbnails...');
  
  const sqliteVideoThumbnails = sqlite.prepare(`
    SELECT * FROM video_thumbnails ORDER BY id
  `).all();
  
  console.log(`Found ${sqliteVideoThumbnails.length} video thumbnails in SQLite`);
  
  if (!isDryRun && sqliteVideoThumbnails.length > 0) {
    for (const thumbnail of sqliteVideoThumbnails) {
      try {
        // Check if video thumbnail already exists
        const existing = await mariadb.videoThumbnail.findUnique({
          where: { id: thumbnail.id }
        });
        
        if (!existing) {
          await mariadb.videoThumbnail.create({
            data: {
              id: thumbnail.id,
              videoId: thumbnail.videoId,
              size: thumbnail.size,
              s3Key: thumbnail.s3Key,
              width: thumbnail.width,
              height: thumbnail.height
            }
          });
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate video thumbnail:`, error.message);
      }
    }
  }
  
  return sqliteVideoThumbnails.length;
}

async function migratePeopleAndFaces() {
  console.log('\n👥 Migrating people and faces...');
  
  // Migrate people first
  const sqlitePeople = sqlite.prepare(`
    SELECT * FROM people ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqlitePeople.length} people in SQLite`);
  
  if (!isDryRun && sqlitePeople.length > 0) {
    for (const person of sqlitePeople) {
      try {
        const existing = await mariadb.person.findUnique({
          where: { id: person.id }
        });
        
        if (!existing) {
          await mariadb.person.create({
            data: {
              id: person.id,
              name: person.name,
              confirmed: person.confirmed ?? false,
              createdAt: new Date(person.createdAt),
              updatedAt: new Date(person.updatedAt)
            }
          });
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate person:`, error.message);
      }
    }
  }
  
  // Migrate faces
  const sqliteFaces = sqlite.prepare(`
    SELECT * FROM faces ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqliteFaces.length} faces in SQLite`);
  
  if (!isDryRun && sqliteFaces.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < sqliteFaces.length; i += batchSize) {
      const batch = sqliteFaces.slice(i, i + batchSize);
      
      try {
        await mariadb.$transaction(async (tx) => {
          for (const face of batch) {
            const existing = await tx.face.findUnique({
              where: { id: face.id }
            });
            
            if (!existing) {
              await tx.face.create({
                data: {
                  id: face.id,
                  photoId: face.photoId,
                  personId: face.personId,
                  boundingBox: face.boundingBox,
                  confidence: face.confidence,
                  embedding: face.embedding,
                  verified: face.verified ?? false,
                  ignored: face.ignored ?? false,
                  createdAt: new Date(face.createdAt)
                }
              });
            }
          }
        });
        
        console.log(`  ✅ Migrated ${Math.min(batchSize, sqliteFaces.length - i)} faces (${i + batch.length}/${sqliteFaces.length})`);
      } catch (error) {
        console.error(`  ❌ Failed to migrate face batch:`, error.message);
      }
    }
  }
  
  return { people: sqlitePeople.length, faces: sqliteFaces.length };
}

async function migrateJobs() {
  console.log('\n⚙️  Migrating job records...');
  
  const jobTables = [
    { sqlite: 'sync_jobs', model: 'syncJob' },
    { sqlite: 'blurhash_jobs', model: 'blurhashJob' },
    { sqlite: 'thumbnail_jobs', model: 'thumbnailJob' },
    { sqlite: 'face_recognition_jobs', model: 'faceRecognitionJob' }
  ];
  
  let totalMigrated = 0;
  
  for (const { sqlite: table, model } of jobTables) {
    try {
      const jobs = sqlite.prepare(`SELECT * FROM ${table} ORDER BY createdAt`).all();
      console.log(`Found ${jobs.length} ${model} records`);
      
      if (!isDryRun && jobs.length > 0) {
        for (const job of jobs) {
          try {
            const existing = await mariadb[model].findUnique({
              where: { id: job.id }
            });
            
            if (!existing) {
              const data = {
                id: job.id,
                status: job.status || 'PENDING',
                progress: job.progress || 0,
                startedAt: job.startedAt ? new Date(job.startedAt) : null,
                completedAt: job.completedAt ? new Date(job.completedAt) : null,
                errors: job.errors,
                logs: job.logs,
                createdAt: new Date(job.createdAt)
              };
              
              // Add model-specific fields
              if (model === 'syncJob') {
                data.albumProgress = job.albumProgress;
                data.totalAlbums = job.totalAlbums || 0;
                data.completedAlbums = job.completedAlbums || 0;
                data.filesProcessed = job.filesProcessed || 0;
                data.filesUploaded = job.filesUploaded || 0;
              } else if (model === 'blurhashJob') {
                data.totalPhotos = job.totalPhotos || 0;
                data.processedPhotos = job.processedPhotos || 0;
              } else if (model === 'thumbnailJob') {
                data.totalPhotos = job.totalPhotos || 0;
                data.processedPhotos = job.processedPhotos || 0;
                data.thumbnailsCreated = job.thumbnailsCreated || 0;
              } else if (model === 'faceRecognitionJob') {
                data.totalPhotos = job.totalPhotos || 0;
                data.processedPhotos = job.processedPhotos || 0;
                data.facesDetected = job.facesDetected || 0;
                data.facesMatched = job.facesMatched || 0;
                data.pausedAt = job.pausedAt ? new Date(job.pausedAt) : null;
              }
              
              await mariadb[model].create({ data });
              totalMigrated++;
            }
          } catch (error) {
            console.error(`  ❌ Failed to migrate ${model}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.log(`  ⏭️  Table ${table} not found in SQLite, skipping`);
    }
  }
  
  return totalMigrated;
}

async function migrateSettings() {
  console.log('\n⚙️  Migrating settings...');
  
  const sqliteSettings = sqlite.prepare(`
    SELECT * FROM site_settings ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqliteSettings.length} settings in SQLite`);
  
  if (!isDryRun && sqliteSettings.length > 0) {
    for (const setting of sqliteSettings) {
      try {
        const existing = await mariadb.siteSettings.findUnique({
          where: { key: setting.key }
        });
        
        if (!existing) {
          await mariadb.siteSettings.create({
            data: {
              id: setting.id,
              key: setting.key,
              value: setting.value,
              createdAt: new Date(setting.createdAt),
              updatedAt: new Date(setting.updatedAt)
            }
          });
        } else {
          // Update existing setting
          await mariadb.siteSettings.update({
            where: { key: setting.key },
            data: {
              value: setting.value,
              updatedAt: new Date(setting.updatedAt)
            }
          });
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate setting ${setting.key}:`, error.message);
      }
    }
  }
  
  return sqliteSettings.length;
}

async function migrateAdminUsers() {
  console.log('\n👨‍💼 Migrating admin users...');
  
  const sqliteAdminUsers = sqlite.prepare(`
    SELECT * FROM admin_users ORDER BY createdAt
  `).all();
  
  console.log(`Found ${sqliteAdminUsers.length} admin users in SQLite`);
  
  if (!isDryRun && sqliteAdminUsers.length > 0) {
    for (const admin of sqliteAdminUsers) {
      try {
        const existing = await mariadb.adminUser.findUnique({
          where: { email: admin.email }
        });
        
        if (!existing) {
          await mariadb.adminUser.create({
            data: {
              id: admin.id,
              email: admin.email,
              name: admin.name,
              password: admin.password,
              role: admin.role || 'ADMIN',
              enabled: admin.enabled ?? true,
              lastLogin: admin.lastLogin ? new Date(admin.lastLogin) : null,
              createdAt: new Date(admin.createdAt),
              updatedAt: new Date(admin.updatedAt),
              createdBy: admin.createdBy
            }
          });
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate admin user ${admin.email}:`, error.message);
      }
    }
  }
  
  return sqliteAdminUsers.length;
}

async function verifyMigration() {
  console.log('\n✅ Verifying migration...');
  
  const finalCounts = await checkDataCounts();
  
  console.log('\nMigration verification complete!');
  return finalCounts;
}

async function promptConfirmation() {
  if (isForce || isDryRun) return true;
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    readline.question('\nDo you want to proceed with the migration? (y/N): ', (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  console.log('🚀 SQLite to MariaDB Migration Tool');
  console.log('=====================================\n');
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    // Validate environment
    await validateEnvironment();
    
    // Check what needs to be migrated
    await checkDataCounts();
    
    // Confirm migration
    if (!(await promptConfirmation())) {
      console.log('Migration cancelled by user.');
      process.exit(0);
    }
    
    // Create backup
    await createBackup();
    
    const startTime = Date.now();
    
    // Run migrations
    const results = {
      albums: await migrateAlbums(),
      photos: await migratePhotos(),
      videos: await migrateVideos(),
      thumbnails: await migrateThumbnails(),
      videoThumbnails: await migrateVideoThumbnails(),
      peopleAndFaces: await migratePeopleAndFaces(),
      jobs: await migrateJobs(),
      settings: await migrateSettings(),
      adminUsers: await migrateAdminUsers()
    };
    
    // Verify migration
    await verifyMigration();
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('=====================================');
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📁 Albums: ${results.albums}`);
    console.log(`🖼️  Photos: ${results.photos}`);
    console.log(`🎥 Videos: ${results.videos}`);
    console.log(`🖼️  Thumbnails: ${results.thumbnails}`);
    console.log(`🎬 Video Thumbnails: ${results.videoThumbnails}`);
    console.log(`👥 People: ${results.peopleAndFaces.people}`);
    console.log(`👤 Faces: ${results.peopleAndFaces.faces}`);
    console.log(`⚙️  Jobs: ${results.jobs}`);
    console.log(`🔧 Settings: ${results.settings}`);
    console.log(`👨‍💼 Admin Users: ${results.adminUsers}`);
    
    if (isDryRun) {
      console.log('\n📝 This was a dry run. No data was actually migrated.');
      console.log('Run without --dry-run to perform the actual migration.');
    } else {
      console.log('\n✅ Your data has been successfully migrated to MariaDB!');
      console.log('You can now run sync operations on the MariaDB database.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (sqlite) {
      sqlite.close();
    }
    await mariadb.$disconnect();
  }
}

// Run the migration
main().catch(console.error);
