#!/bin/bash

# MariaDB Migration Script for Lumina Photo Gallery
# This script helps migrate from SQLite to MariaDB

set -e

echo "🚀 Starting MariaDB Migration for Lumina Photo Gallery"

# Configuration
DB_NAME="lumina_production"
DB_USER="lumina_user"
DB_PASSWORD=""  # Set this or pass as environment variable
DB_HOST="localhost"
DB_PORT="3306"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if MariaDB is installed
if ! command -v mysql &> /dev/null; then
    print_error "MariaDB client not found. Please install MariaDB first."
    exit 1
fi

# Get database password if not set
if [ -z "$DB_PASSWORD" ]; then
    read -s -p "Enter MariaDB password for user $DB_USER: " DB_PASSWORD
    echo
fi

print_step "Step 1: Creating database and user"

# Create database and user
mysql -h $DB_HOST -P $DB_PORT -u root -p << EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
EOF

print_step "Step 2: Setting up environment variables"

# Create production DATABASE_URL
DB_URL="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"

# Update or create .env.production
if [ -f .env.production ]; then
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=\"$DB_URL\"|" .env.production
else
    echo "DATABASE_URL=\"$DB_URL\"" > .env.production
fi

print_step "Step 3: Installing dependencies"
npm install mysql2

print_step "Step 4: Generating Prisma client for MariaDB"
npx prisma generate

print_step "Step 5: Running database migrations"
npx prisma db push

print_step "Step 6: Seeding database (optional)"
read -p "Do you want to run the database seed? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run db:seed
fi

print_step "✅ Migration completed successfully!"
echo
echo "📋 Next steps:"
echo "1. Update your production environment with the new DATABASE_URL"
echo "2. Test the application with: NODE_ENV=production npm run dev"
echo "3. Deploy your application"
echo
echo "🔗 Database URL: $DB_URL"
