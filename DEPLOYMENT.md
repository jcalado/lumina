# Docker Deployment Guide for Lumina Photo Gallery

This guide explains how to deploy the complete Lumina photo gallery application using Docker and Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available
- At least 10GB free disk space
- Domain name (optional but recommended)

## Docker Setup

Lumina uses a multi-stage Dockerfile that supports both development and production environments:

- **Development**: Hot reloading, source code mounting, all dependencies
- **Production**: Optimized standalone build, minimal runtime image

### Development Environment

For development with hot reloading and debugging:

```bash
docker compose -f docker-compose.dev.yml up
```

### Production Environment

For production deployment with optimized builds:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd lumina
```

### 2. Configure Environment

```bash
cp .env.docker .env
```

Edit `.env` with your actual values:

```bash
# Database password (change this!)
DB_PASSWORD=your_secure_database_password

# Authentication
NEXTAUTH_SECRET=your-super-secure-random-secret-key
NEXTAUTH_URL=https://yourdomain.com

# Admin credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-admin-password

# S3 Configuration (AWS S3, DigitalOcean Spaces, etc.)
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=your-production-bucket
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=us-east-1

# File paths
PHOTOS_ROOT_PATH=/var/app/photos
```

### 3. Build and Deploy

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# Or for development with exposed ports
docker-compose up -d
```

### 4. Initialize Database

```bash
# Generate Prisma client
docker-compose -f docker-compose.prod.yml exec app npm run db:generate

# Run database migrations
docker-compose -f docker-compose.prod.yml exec app npm run db:push

# Seed initial data (optional)
docker-compose -f docker-compose.prod.yml exec app npm run db:seed
```

### 5. Access Your Application

- **Gallery**: http://localhost:3000 (or your domain)
- **Admin Panel**: http://localhost:3000/admin

## Production Deployment

### Using Docker Compose (Recommended)

1. **On your production server:**

```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Deploy the application:**

```bash
git clone <your-repo-url>
cd lumina
cp .env.docker .env
# Edit .env with production values
docker-compose -f docker-compose.prod.yml up -d
```

3. **Setup SSL (with Caddy or Nginx):**

```bash
# Using Caddy (simple)
docker run -d \
  --name caddy \
  -p 80:80 -p 443:443 \
  -v caddy_data:/data \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  caddy:2
```

Caddyfile:
```
yourdomain.com {
    reverse_proxy app:3000
}
```

### Using Docker Swarm

For production with multiple nodes:

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.prod.yml lumina
```

### Using Kubernetes

Convert the compose file to Kubernetes manifests:

```bash
# Using kompose
kompose convert -f docker-compose.prod.yml
```

## Services Overview

### Core Services

- **app**: Main Next.js application (port 3000)
- **postgres**: PostgreSQL database
- **redis**: Redis for queues and caching

### Worker Services

- **worker-thumbnails**: Generates image thumbnails
- **worker-blurhash**: Creates blurhash placeholders
- **worker-exif**: Extracts EXIF metadata
- **worker-uploads**: Handles file uploads
- **worker-sync**: Synchronizes with S3

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `DB_PASSWORD` | PostgreSQL password (for docker-compose) | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `NEXTAUTH_SECRET` | Authentication secret | Yes |
| `NEXTAUTH_URL` | Application URL | Yes |
| `ADMIN_EMAIL` | Admin email | Yes |
| `ADMIN_PASSWORD` | Admin password | Yes |
| `S3_ENDPOINT` | S3-compatible endpoint | Yes |
| `S3_BUCKET` | S3 bucket name | Yes |
| `S3_ACCESS_KEY` | S3 access key | Yes |
| `S3_SECRET_KEY` | S3 secret key | Yes |
| `S3_REGION` | S3 region | Yes |
| `PHOTOS_ROOT_PATH` | Local photos directory | No |
| `PHOTOS_DATA` | Docker volume name for photos (default: photos_data) | No |
| `SYNC_CRON` | Sync schedule (cron format) | No |

### Database Configuration

The application uses PostgreSQL. Make sure to:

1. Set a strong `DB_PASSWORD`
2. Configure `DATABASE_URL` correctly
3. Run migrations after first deployment

### Storage Configuration

Lumina supports S3-compatible storage:

- **AWS S3**: Use standard AWS endpoints
- **DigitalOcean Spaces**: Use region-specific endpoints
- **MinIO**: Use your MinIO server endpoint
- **LocalStack**: For development

### Docker Volume Configuration

The Docker setup uses named volumes for data persistence:

- **postgres_data**: PostgreSQL database files
- **redis_data**: Redis data and cache
- **photos_data**: Local photo storage (can be overridden)

You can customize volume names using environment variables:

```bash
# Override default volume names
PHOTOS_DATA=my_custom_photos_volume
```

This is useful when:
- Migrating from existing deployments
- Using external volume management
- Running multiple instances on the same host

**Note**: Volume names in docker-compose are global to the Docker host. Use unique names when running multiple Lumina instances.

## Monitoring and Maintenance

### Health Checks

All services include health checks. Monitor them with:

```bash
docker-compose -f docker-compose.prod.yml ps
```

### Logs

View logs for all services:

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

View logs for specific service:

```bash
docker-compose -f docker-compose.prod.yml logs -f app
```

### Backups

#### Database Backup

```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U lumina_user lumina_production > backup.sql

# Restore backup
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U lumina_user lumina_production < backup.sql
```

#### Volumes Backup

```bash
# Backup volumes
docker run --rm -v lumina_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
docker run --rm -v lumina_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis_backup.tar.gz -C /data .
```

### Updates

To update the application:

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

### Common Issues

1. **Database connection fails**
   - Check `DATABASE_URL` in `.env`
   - Ensure PostgreSQL container is healthy
   - Verify database credentials

2. **Redis connection fails**
   - Check `REDIS_URL` in `.env`
   - Ensure Redis container is running

3. **S3 upload fails**
   - Verify S3 credentials
   - Check bucket permissions
   - Ensure endpoint is correct

4. **Workers not processing**
   - Check Redis connectivity
   - Verify worker logs
   - Ensure database is accessible

### Performance Tuning

- **Database**: Monitor slow queries, consider indexing
- **Redis**: Monitor memory usage
- **Workers**: Scale based on workload
- **App**: Monitor response times and memory usage

## Security Considerations

1. **Change default passwords**
2. **Use strong secrets for NextAuth**
3. **Configure firewall rules**
4. **Keep Docker images updated**
5. **Use HTTPS in production**
6. **Regular backups**
7. **Monitor logs for suspicious activity**

## Support

For issues and questions:
- Check the logs: `docker-compose logs`
- Verify configuration in `.env`
- Ensure all required environment variables are set
- Check service health: `docker-compose ps`
