# MariaDB Migration Script for Lumina Photo Gallery (PowerShell)
# This script helps migrate from SQLite to MariaDB on Windows

param(
    [string]$DBName = "lumina_production",
    [string]$DBUser = "lumina_user",
    [string]$DBHost = "localhost",
    [string]$DBPort = "3306",
    [string]$DBPassword = ""
)

Write-Host "🚀 Starting MariaDB Migration for Lumina Photo Gallery" -ForegroundColor Green

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

# Check if mysql client is available
try {
    mysql --version | Out-Null
} catch {
    Write-Error "MariaDB client not found. Please install MariaDB first."
    exit 1
}

# Get database password if not provided
if ([string]::IsNullOrEmpty($DBPassword)) {
    $SecurePassword = Read-Host "Enter MariaDB password for user $DBUser" -AsSecureString
    $DBPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
}

Write-Step "Step 1: Creating database and user"

# Create SQL commands
$sqlCommands = @"
CREATE DATABASE IF NOT EXISTS $DBName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DBUser'@'%' IDENTIFIED BY '$DBPassword';
GRANT ALL PRIVILEGES ON $DBName.* TO '$DBUser'@'%';
FLUSH PRIVILEGES;
"@

# Execute SQL commands
$sqlCommands | mysql -h $DBHost -P $DBPort -u root -p

Write-Step "Step 2: Setting up environment variables"

# Create production DATABASE_URL components
$envContent = @"
# MariaDB Database Connection Components
DB_HOST="$DBHost"
DB_PORT="$DBPort"
DB_DATABASE="$DBName"
DB_USERNAME="$DBUser"
DB_PASSWORD="$DBPassword"
DB_CHARSET="utf8mb4"
DB_COLLATION="utf8mb4_unicode_ci"

# Alternative: Set DATABASE_URL directly if preferred
# DATABASE_URL="mysql://$DBUser`:$DBPassword@$DBHost`:$DBPort/$DBName?charset=utf8mb4&collation=utf8mb4_unicode_ci"
"@
if (Test-Path ".env.production") {
    (Get-Content ".env.production") -replace "DATABASE_URL=.*", $envContent | Set-Content ".env.production"
} else {
    $envContent | Out-File -FilePath ".env.production" -Encoding UTF8
}

Write-Step "Step 3: Installing dependencies"
npm install mysql2

Write-Step "Step 4: Generating Prisma client for MariaDB"
npx prisma generate

Write-Step "Step 5: Running database migrations"
npx prisma db push

Write-Step "Step 6: Seeding database (optional)"
$seedResponse = Read-Host "Do you want to run the database seed? (y/n)"
if ($seedResponse -match "^[Yy]") {
    npm run db:seed
}

Write-Step "✅ Migration completed successfully!"
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Update your production environment with the database connection components"
Write-Host "2. Test the application with: `$env:NODE_ENV='production'; npm run dev"
Write-Host "3. Deploy your application"
Write-Host ""
Write-Host "🔗 Database Components Set:" -ForegroundColor Cyan
Write-Host "   Host: $DBHost"
Write-Host "   Port: $DBPort"
Write-Host "   Database: $DBName"
Write-Host "   Username: $DBUser"
