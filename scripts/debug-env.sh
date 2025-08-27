#!/bin/bash

# Debug Environment Variables Script
# Use this to troubleshoot database configuration issues

echo "🔍 Environment Debug Information"
echo "================================="
echo ""

echo "📁 Available environment files:"
ls -la .env* 2>/dev/null || echo "   No .env files found"
echo ""

echo "🔧 Current NODE_ENV:"
echo "   NODE_ENV=${NODE_ENV:-"not set"}"
echo ""

echo "🗂️ Environment file contents:"
echo ""

if [ -f ".env" ]; then
    echo "📄 .env file:"
    grep -E "^(DATABASE_URL|DB_)" .env 2>/dev/null || echo "   No database variables found"
    echo ""
fi

if [ -f ".env.production" ]; then
    echo "📄 .env.production file:"
    grep -E "^(DATABASE_URL|DB_)" .env.production 2>/dev/null || echo "   No database variables found"
    echo ""
fi

echo "🔗 Current environment variables:"
echo "   DATABASE_URL=${DATABASE_URL:-"not set"}"
echo "   DB_HOST=${DB_HOST:-"not set"}"
echo "   DB_PORT=${DB_PORT:-"not set"}"
echo "   DB_DATABASE=${DB_DATABASE:-"not set"}"
echo "   DB_USERNAME=${DB_USERNAME:-"not set"}"
echo "   DB_PASSWORD=${DB_PASSWORD:+"***set***"}"
echo ""

echo "🧪 Testing Prisma schema validation:"
npx prisma validate 2>&1 | head -10

echo ""
echo "💡 Recommendations:"

if [ ! -f ".env" ]; then
    echo "   ⚠️  No .env file found - copy .env.production to .env"
elif ! grep -q "mysql://" .env 2>/dev/null; then
    if ! grep -q "DB_HOST=" .env 2>/dev/null; then
        echo "   ❌ .env file doesn't contain valid database config"
    else
        echo "   ℹ️  .env contains DB_* variables (should auto-construct DATABASE_URL)"
    fi
else
    echo "   ✅ .env file appears to contain MySQL configuration"
fi

if [ -f ".env.production" ] && [ ! -f ".env" ]; then
    echo "   🔧 Run: cp .env.production .env"
fi
