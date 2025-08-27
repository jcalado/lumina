# SQLite to MariaDB Migration Guide

This guide helps you migrate your Lumina Photo Gallery from SQLite to MariaDB for production deployment.

## Prerequisites

1. **MariaDB Server**: Install MariaDB 10.4+ on your production server
2. **Node.js**: Ensure you have Node.js 18+ installed
3. **Backup**: Create a backup of your current SQLite database

## Migration Steps

### 1. Install MariaDB Dependencies

```bash
npm install mysql2
```

### 2. Set Up MariaDB Database

```sql
-- Connect to MariaDB as root
mysql -u root -p

-- Create database and user
CREATE DATABASE lumina_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lumina_user'@'%' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON lumina_production.* TO 'lumina_user'@'%';
FLUSH PRIVILEGES;
```

### 3. Update Environment Configuration

Create `.env.production` using individual database components (recommended):

```bash
# MariaDB Database Connection Components
DB_HOST="localhost"
DB_PORT="3306"
DB_DATABASE="lumina_production"
DB_USERNAME="lumina_user"
DB_PASSWORD="your_secure_password"
DB_CHARSET="utf8mb4"
DB_COLLATION="utf8mb4_unicode_ci"
```

Alternatively, you can set the `DATABASE_URL` directly:

```bash
DATABASE_URL="mysql://lumina_user:your_secure_password@localhost:3306/lumina_production?charset=utf8mb4&collation=utf8mb4_unicode_ci"
```

**Benefits of using individual components:**
- Better security (password is separate)
- Easier to manage in containerized environments
- More flexible for different deployment scenarios
- Clearer configuration validation

### 4. Update Prisma Schema

The schema has been updated to use MySQL provider. Generate the new client:

```bash
npx prisma generate
npx prisma db push
```

### 5. Migrate Existing Data (Optional)

If you have existing data in SQLite:

```bash
# Set environment variables for the migration
export SQLITE_DB_PATH="./prisma/dev.db"
export DB_HOST="localhost"
export DB_PORT="3306"
export DB_DATABASE="lumina_production"
export DB_USERNAME="lumina_user"
export DB_PASSWORD="your_secure_password"

# Run migration
npm run db:migrate-to-mariadb
```

### 6. Apply MariaDB Optimizations

```bash
mysql -u lumina_user -p lumina_production < scripts/mariadb-optimizations.sql
```

### 7. Test the Migration

```bash
# Check database configuration and connection
npm run db:status

# Test with production database
NODE_ENV=production npm run dev
```

## MariaDB vs MySQL Differences

While MariaDB is MySQL-compatible, here are key differences relevant to this project:

### Performance Benefits
- **Better JSON handling**: MariaDB has enhanced JSON functions
- **Improved query optimization**: Better handling of complex face recognition queries
- **Storage engines**: Multiple storage engines for different use cases

### Face Recognition Specific
- **Text/Blob handling**: Better handling of large face embeddings
- **Index optimization**: More efficient indexing for similarity searches
- **Concurrent connections**: Better handling of multiple face recognition jobs

## Configuration Recommendations

### MariaDB Configuration (`/etc/mysql/mariadb.conf.d/50-server.cnf`)

```ini
[server]
# Face recognition optimizations
max_allowed_packet = 64M
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M

# Query cache for read-heavy operations
query_cache_type = ON
query_cache_size = 256M

# Connection handling
max_connections = 200
wait_timeout = 600
```

### Connection Pool Settings

In your production environment, consider using connection pooling:

```javascript
// In your Prisma configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=20&pool_timeout=60"
    }
  }
})
```

## Backup and Recovery

### Backup
```bash
mysqldump -u lumina_user -p lumina_production > backup.sql
```

### Restore
```bash
mysql -u lumina_user -p lumina_production < backup.sql
```

## Monitoring

### Key Metrics to Monitor
1. **Face recognition job performance**
2. **Database connection pool usage**
3. **Query performance for large datasets**
4. **Storage growth (face embeddings can be large)**

### Useful Queries
```sql
-- Monitor face recognition progress
SELECT status, COUNT(*) FROM face_recognition_jobs GROUP BY status;

-- Check face embedding storage
SELECT 
  COUNT(*) as total_faces,
  AVG(LENGTH(embedding)) as avg_embedding_size,
  SUM(LENGTH(embedding)) as total_embedding_storage
FROM faces 
WHERE embedding IS NOT NULL;

-- Performance monitoring
SHOW PROCESSLIST;
SHOW ENGINE INNODB STATUS;
```

## Troubleshooting

### Common Issues

1. **Connection Issues**
   - Check MariaDB service status
   - Verify user permissions
   - Test network connectivity

2. **Performance Issues**
   - Monitor buffer pool usage
   - Check for missing indexes
   - Analyze slow query log

3. **Face Recognition Specific**
   - Large embedding storage
   - Complex similarity queries
   - Concurrent job handling

### Solutions

1. **Increase max_allowed_packet** for large face embeddings
2. **Optimize indexes** for face similarity searches
3. **Use connection pooling** for better resource management
4. **Monitor memory usage** during face recognition jobs

## Production Deployment

### Docker Example

```dockerfile
# MariaDB container
version: '3.8'
services:
  mariadb:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: lumina_production
      MYSQL_USER: lumina_user
      MYSQL_PASSWORD: user_password
    volumes:
      - mariadb_data:/var/lib/mysql
      - ./scripts/mariadb-optimizations.sql:/docker-entrypoint-initdb.d/optimizations.sql
    ports:
      - "3306:3306"

volumes:
  mariadb_data:
```

### Security Considerations

1. **Use SSL/TLS** for database connections
2. **Restrict database user permissions**
3. **Enable MariaDB audit plugin** for compliance
4. **Regular security updates**

## Support

For issues specific to this migration:
1. Check the application logs
2. Monitor MariaDB error logs
3. Verify environment variables
4. Test with a smaller dataset first
