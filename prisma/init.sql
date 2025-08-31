-- PostgreSQL initialization script for Lumina
-- This file runs when the PostgreSQL container starts for the first time

-- Create the production database if it doesn't exist
-- (This is handled by POSTGRES_DB environment variable, but keeping for reference)

-- Set timezone
SET timezone = 'UTC';

-- Create extensions if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
