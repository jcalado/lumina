#!/bin/bash

# Production Setup Script for Lumina Photo Gallery
# This script properly sets up the production environment and database

set -e

echo "🚀 Setting up Lumina Photo Gallery for Production"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}📝 $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    print_error ".env.production file not found!"
    echo "Please create .env.production with your database configuration:"
    echo ""
    echo "DB_HOST=\"localhost\""
    echo "DB_PORT=\"3306\""
    echo "DB_DATABASE=\"lumina_production\""
    echo "DB_USERNAME=\"lumina_user\""
    echo "DB_PASSWORD=\"your_secure_password\""
    echo "DB_CHARSET=\"utf8mb4\""
    echo "DB_COLLATION=\"utf8mb4_unicode_ci\""
    exit 1
fi

print_step "Step 1: Setting up environment"

# Set NODE_ENV to production
export NODE_ENV=production

# Load production environment variables
set -a  # automatically export all variables
source .env.production
set +a

print_step "Step 2: Installing dependencies"

# Install required dependencies
if ! command -v dotenv &> /dev/null; then
    npm install -g dotenv-cli
fi

# Install project dependencies
npm install

print_step "Step 3: Generating Prisma client for production"

# Generate Prisma client with production environment
npx dotenv -e .env.production -- npx prisma generate

print_step "Step 4: Setting up database schema"

# Push database schema
npx dotenv -e .env.production -- npx prisma db push

print_step "Step 5: Testing database connection"

# Test database status
npm run db:status:prod

print_step "Step 6: Building application for production"

# Build the Next.js application
npm run build

print_step "✅ Production setup completed successfully!"

echo ""
echo "📋 Next steps:"
echo "1. Start the application: npm start"
echo "2. Or start with PM2: pm2 start npm --name \"lumina\" -- start"
echo "3. Monitor with: npm run db:status:prod"
echo ""
echo "🔧 Useful production commands:"
echo "   npm run db:studio:prod    - Open Prisma Studio with production DB"
echo "   npm run db:status:prod    - Check database status"
echo "   npm run db:seed:prod      - Seed production database"
