#!/usr/bin/env tsx

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Environment Variable Check for Blurhash Worker\n');

const requiredVars = {
  'S3_BUCKET': process.env.S3_BUCKET,
  'S3_ACCESS_KEY': process.env.S3_ACCESS_KEY,
  'S3_SECRET_KEY': process.env.S3_SECRET_KEY,
};

const optionalVars = {
  'S3_REGION': process.env.S3_REGION || 'us-east-1 (default)',
  'S3_ENDPOINT': process.env.S3_ENDPOINT || 'default AWS endpoint',
};

console.log('Required Environment Variables:');
console.log('================================');
let allValid = true;

for (const [key, value] of Object.entries(requiredVars)) {
  const status = value ? '✅ SET' : '❌ MISSING';
  const displayValue = value ? (key.includes('SECRET') ? '***HIDDEN***' : value) : 'NOT SET';
  console.log(`${key}: ${status} (${displayValue})`);
  if (!value) allValid = false;
}

console.log('\nOptional Environment Variables:');
console.log('===============================');
for (const [key, value] of Object.entries(optionalVars)) {
  console.log(`${key}: ${value}`);
}

console.log('\n' + '='.repeat(50));
if (allValid) {
  console.log('✅ All required environment variables are set!');
  console.log('The blurhash worker should be able to connect to S3.');
} else {
  console.log('❌ Some required environment variables are missing!');
  console.log('Please check your .env file and ensure all required variables are set.');
  console.log('\nExample .env file:');
  console.log('S3_BUCKET=your-bucket-name');
  console.log('S3_ACCESS_KEY=your-access-key');
  console.log('S3_SECRET_KEY=your-secret-key');
  console.log('S3_REGION=us-east-1  # optional');
  console.log('S3_ENDPOINT=https://your-s3-endpoint.com  # optional, for custom S3 providers');
}

console.log('\n💡 Tip: Make sure your .env file is in the root directory of your project.');
