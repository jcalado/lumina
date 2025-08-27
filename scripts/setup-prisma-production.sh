#!/bin/bash

# Quick Production Environment Setup for Prisma Commands
# Run this script on your production server before running Prisma commands

echo "🔧 Setting up production environment for Prisma..."

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found!"
    echo "Please create .env.production with your MariaDB configuration."
    exit 1
fi

# Backup existing .env if it exists
if [ -f ".env" ]; then
    echo "� Backing up existing .env to .env.backup"
    cp .env .env.backup
fi

# Copy .env.production to .env (Prisma always loads .env)
echo "📋 Copying .env.production to .env for Prisma compatibility..."
cp .env.production .env

echo "✅ Setup complete!"
echo ""
echo "🔍 Verifying DATABASE_URL..."
if grep -q "^DATABASE_URL.*mysql://" .env; then
    echo "✅ DATABASE_URL contains MySQL connection string"
elif grep -q "^DB_HOST=" .env; then
    echo "✅ Found DB_* variables - they will be auto-constructed into DATABASE_URL"
else
    echo "❌ No valid database configuration found in .env"
    exit 1
fi

echo ""
echo "🚀 Running Prisma DB push..."
npx prisma db push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database schema successfully applied!"
    echo ""
    echo "📋 Available commands:"
    echo "   npx prisma generate     - Generate Prisma client"
    echo "   npx prisma studio       - Open Prisma Studio"
    echo "   npm run db:seed         - Seed the database"
    echo ""
    echo "💡 Note: .env now contains your production config"
    echo "   Original .env backed up as .env.backup"
else
    echo ""
    echo "❌ Failed to apply database schema"
    echo "   Check your database connection and credentials"
fi
