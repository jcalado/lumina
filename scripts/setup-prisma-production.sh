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

# Option 1: Install dotenv-cli and use production commands
if command -v npm &> /dev/null; then
    echo "📦 Installing dotenv-cli..."
    npm install -g dotenv-cli
    
    echo "✅ Setup complete! Now you can use:"
    echo "   npx dotenv -e .env.production -- npx prisma db push"
    echo "   npx dotenv -e .env.production -- npx prisma generate"
    echo "   npx dotenv -e .env.production -- npx prisma studio"
    
    echo ""
    echo "🚀 Running Prisma DB push with production config..."
    npx dotenv -e .env.production -- npx prisma db push
    
else
    # Option 2: Copy .env.production to .env as fallback
    echo "📋 Copying .env.production to .env..."
    cp .env.production .env
    
    echo "✅ Setup complete! Now you can run:"
    echo "   npx prisma db push"
    echo "   npx prisma generate" 
    echo "   npx prisma studio"
    
    echo ""
    echo "🚀 Running Prisma DB push..."
    npx prisma db push
fi
