#!/bin/bash

# Auto-construct DATABASE_URL Script
# This script adds a properly constructed DATABASE_URL to your .env.production file

echo "🔧 Auto-constructing DATABASE_URL for .env.production"

if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found!"
    exit 1
fi

# Source the .env.production file to get variables
source .env.production

# Check if we have all required variables
if [ -z "$DB_HOST" ] || [ -z "$DB_USERNAME" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_DATABASE" ]; then
    echo "❌ Missing required DB_* variables in .env.production"
    echo "Required: DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE"
    exit 1
fi

# Set defaults
DB_PORT=${DB_PORT:-3306}
DB_CHARSET=${DB_CHARSET:-utf8mb4}
DB_COLLATION=${DB_COLLATION:-utf8mb4_unicode_ci}

# Construct DATABASE_URL
DATABASE_URL="mysql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}?charset=${DB_CHARSET}&collation=${DB_COLLATION}"

echo "✅ Constructed DATABASE_URL for database: ${DB_DATABASE}"

# Check if DATABASE_URL already exists in .env.production
if grep -q "^DATABASE_URL=" .env.production; then
    # Replace existing DATABASE_URL
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env.production
    echo "🔄 Updated existing DATABASE_URL in .env.production"
else
    # Add DATABASE_URL to the file
    echo "" >> .env.production
    echo "# Auto-generated DATABASE_URL" >> .env.production
    echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env.production
    echo "➕ Added DATABASE_URL to .env.production"
fi

echo ""
echo "📋 .env.production now contains:"
echo "   DATABASE_URL=mysql://${DB_USERNAME}:***@${DB_HOST}:${DB_PORT}/${DB_DATABASE}?charset=${DB_CHARSET}&collation=${DB_COLLATION}"
echo ""
echo "🚀 Now you can run:"
echo "   cp .env.production .env"
echo "   npx prisma db push"
