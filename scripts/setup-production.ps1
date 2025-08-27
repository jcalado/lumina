# Production Setup Script for Lumina Photo Gallery (PowerShell)
# This script properly sets up the production environment and database

param(
    [switch]$Force
)

Write-Host "🚀 Setting up Lumina Photo Gallery for Production" -ForegroundColor Green

function Write-Step {
    param([string]$Message)
    Write-Host "📝 $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Check if .env.production exists
if (-not (Test-Path ".env.production")) {
    Write-Error ".env.production file not found!"
    Write-Host "Please create .env.production with your database configuration:"
    Write-Host ""
    Write-Host 'DB_HOST="localhost"'
    Write-Host 'DB_PORT="3306"'
    Write-Host 'DB_DATABASE="lumina_production"'
    Write-Host 'DB_USERNAME="lumina_user"'
    Write-Host 'DB_PASSWORD="your_secure_password"'
    Write-Host 'DB_CHARSET="utf8mb4"'
    Write-Host 'DB_COLLATION="utf8mb4_unicode_ci"'
    exit 1
}

Write-Step "Step 1: Setting up environment"

# Set NODE_ENV to production
$env:NODE_ENV = "production"

# Load production environment variables (PowerShell version)
Get-Content ".env.production" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim('"')
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Write-Step "Step 2: Installing dependencies"

# Check and install dotenv-cli
try {
    dotenv --version | Out-Null
} catch {
    npm install -g dotenv-cli
}

# Install project dependencies
npm install

Write-Step "Step 3: Generating Prisma client for production"

# Generate Prisma client with production environment
npx dotenv -e .env.production -- npx prisma generate

Write-Step "Step 4: Setting up database schema"

# Push database schema
npx dotenv -e .env.production -- npx prisma db push

Write-Step "Step 5: Testing database connection"

# Test database status
npm run db:status:prod

Write-Step "Step 6: Building application for production"

# Build the Next.js application
npm run build

Write-Step "✅ Production setup completed successfully!"

Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Start the application: npm start"
Write-Host "2. Or start with PM2: pm2 start npm --name `"lumina`" -- start"
Write-Host "3. Monitor with: npm run db:status:prod"
Write-Host ""
Write-Host "🔧 Useful production commands:" -ForegroundColor Cyan
Write-Host "   npm run db:studio:prod    - Open Prisma Studio with production DB"
Write-Host "   npm run db:status:prod    - Check database status"
Write-Host "   npm run db:seed:prod      - Seed production database"
