#!/usr/bin/env pwsh
<#
.SYNOPSIS
    SQLite to MariaDB Migration Tool for Windows PowerShell

.DESCRIPTION
    This script wraps the Node.js migration tool and handles environment setup
    for migrating data from SQLite to MariaDB production database.

.PARAMETER DryRun
    Show what would be migrated without actually doing it

.PARAMETER Force
    Skip confirmation prompts

.PARAMETER SqliteDbPath
    Path to the SQLite database file (optional, defaults to prisma/dev.db)

.EXAMPLE
    .\migrate-sqlite-to-mariadb.ps1 -DryRun
    Preview what would be migrated

.EXAMPLE
    .\migrate-sqlite-to-mariadb.ps1 -Force
    Run migration without prompts

.EXAMPLE
    .\migrate-sqlite-to-mariadb.ps1 -SqliteDbPath "C:\backup\production.db"
    Migrate from a specific SQLite database file
#>

param(
    [switch]$DryRun,
    [switch]$Force,
    [string]$SqliteDbPath
)

# Set error action
$ErrorActionPreference = "Stop"

# Colors for output
function Write-Success($Message) {
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning($Message) {
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error($Message) {
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info($Message) {
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

Write-Host "🚀 SQLite to MariaDB Migration Tool" -ForegroundColor Magenta
Write-Host "====================================" -ForegroundColor Magenta
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "package.json")) {
    Write-Error "This script must be run from the Lumina project root directory"
    Write-Host "Please navigate to the project directory and try again"
    exit 1
}

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Success "Node.js version: $nodeVersion"
} catch {
    Write-Error "Node.js is not installed or not in PATH"
    Write-Host "Please install Node.js and try again"
    exit 1
}

# Check if required dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Warning "Node modules not found. Installing dependencies..."
    npm install
}

# Check for better-sqlite3 dependency
try {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $hasSqlite = $packageJson.dependencies."better-sqlite3" -or $packageJson.devDependencies."better-sqlite3"
    
    if (-not $hasSqlite) {
        Write-Warning "Installing better-sqlite3 for SQLite access..."
        npm install better-sqlite3 --save-dev
    }
} catch {
    Write-Warning "Could not check dependencies. Attempting to install better-sqlite3..."
    npm install better-sqlite3 --save-dev
}

# Load environment variables from .env.production
if (Test-Path ".env.production") {
    Write-Info "Loading environment from .env.production"
    
    # Read .env.production and set environment variables
    $envLines = Get-Content ".env.production" | Where-Object { $_ -match "^[^#].*=" }
    foreach ($line in $envLines) {
        if ($line -match "^([^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            $value = $value -replace '^"(.*)"$', '$1'
            $value = $value -replace "^'(.*)'$", '$1'
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "  Set $name" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Error ".env.production file not found"
    Write-Host "Please ensure you have a .env.production file with MariaDB configuration"
    exit 1
}

# Build NODE_OPTIONS for environment
$nodeArgs = @()

if ($DryRun) {
    $nodeArgs += "--dry-run"
    Write-Info "Running in DRY RUN mode - no changes will be made"
}

if ($Force) {
    $nodeArgs += "--force"
    Write-Info "Running in FORCE mode - skipping confirmations"
}

# Set SQLite database path if provided
if ($SqliteDbPath) {
    if (-not (Test-Path $SqliteDbPath)) {
        Write-Error "SQLite database file not found: $SqliteDbPath"
        exit 1
    }
    [Environment]::SetEnvironmentVariable("SQLITE_DB_PATH", $SqliteDbPath, "Process")
    Write-Info "Using SQLite database: $SqliteDbPath"
}

# Construct database URL from components
$dbHost = [Environment]::GetEnvironmentVariable("DB_HOST")
$dbPort = [Environment]::GetEnvironmentVariable("DB_PORT")
$dbDatabase = [Environment]::GetEnvironmentVariable("DB_DATABASE")
$dbUsername = [Environment]::GetEnvironmentVariable("DB_USERNAME")
$dbPassword = [Environment]::GetEnvironmentVariable("DB_PASSWORD")

if (-not $dbHost -or -not $dbDatabase -or -not $dbUsername) {
    Write-Error "Missing required database configuration"
    Write-Host "Please ensure .env.production contains:"
    Write-Host "  DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD"
    exit 1
}

$databaseUrl = "mysql://${dbUsername}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabase}"
[Environment]::SetEnvironmentVariable("DATABASE_URL", $databaseUrl, "Process")

Write-Success "Database URL configured for MariaDB connection"

# Test MariaDB connection before proceeding
Write-Info "Testing MariaDB connection..."
try {
    # Use a simple Prisma command to test connection
    $null = npx dotenv-cli -e .env.production -- npx prisma db execute --schema prisma/schema.prisma --sql "SELECT 1 as test;" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "MariaDB connection successful"
    } else {
        Write-Warning "Could not test MariaDB connection, but proceeding..."
    }
} catch {
    Write-Warning "Could not test MariaDB connection, but proceeding..."
}

# Check for migration script
$migrationScript = "scripts\migrate-sqlite-to-mariadb.js"
if (-not (Test-Path $migrationScript)) {
    Write-Error "Migration script not found: $migrationScript"
    Write-Host "Please ensure the migration script exists"
    exit 1
}

Write-Host ""
Write-Info "Starting migration process..."
Write-Host ""

# Run the migration
try {
    $argString = $nodeArgs -join " "
    $command = "node `"$migrationScript`" $argString"
    
    Write-Host "Executing: $command" -ForegroundColor DarkGray
    
    Invoke-Expression $command
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Success "Migration process completed successfully!"
        
        if (-not $DryRun) {
            Write-Host ""
            Write-Info "Next steps:"
            Write-Host "1. Verify your data in the MariaDB database"
            Write-Host "2. Run a sync operation to ensure everything works"
            Write-Host "3. Update your production deployment to use MariaDB"
            Write-Host "4. Consider backing up the SQLite database before deletion"
        }
    } else {
        Write-Error "Migration process failed with exit code: $LASTEXITCODE"
        exit 1
    }
    
} catch {
    Write-Error "Failed to run migration: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "🎉 Migration tool execution completed!" -ForegroundColor Magenta
