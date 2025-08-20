#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { encode } from 'blurhash';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function generateBlurhashFromFile(imagePath: string): Promise<string> {
  try {
    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Resize image to a small size for blurhash processing
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Generate blurhash
    const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
    return blurhash;
  } catch (error) {
    console.error('Error generating blurhash:', error);
    throw error;
  }
}

async function testBlurhashGeneration() {
  try {
    console.log('🧪 Testing blurhash generation from sample image...');
    
    // Create a test image buffer (1x1 blue pixel)
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 100, g: 150, b: 200 }
      }
    }).png().toBuffer();

    // Generate blurhash
    const { data, info } = await sharp(testImageBuffer)
      .resize(32, 32, { fit: 'cover' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
    
    console.log('✅ Successfully generated test blurhash:', blurhash);
    
    // Update a sample photo with the test blurhash
    const samplePhoto = await prisma.photo.findFirst({
      where: {
        blurhash: null,
      },
    });

    if (samplePhoto) {
      await prisma.photo.update({
        where: { id: samplePhoto.id },
        data: { blurhash },
      });
      console.log(`✅ Updated photo ${samplePhoto.filename} with test blurhash`);
    } else {
      console.log('ℹ️  No photos found without blurhash');
    }

  } catch (error) {
    console.error('❌ Error testing blurhash generation:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function generateSampleBlurhashes() {
  try {
    console.log('🎨 Generating sample blurhashes for testing...');
    
    // Get photos without blurhash
    const photos = await prisma.photo.findMany({
      where: {
        blurhash: null,
      },
      take: 5, // Limit to 5 for testing
    });

    console.log(`Found ${photos.length} photos to process`);

    // Generate different colored test blurhashes
    const testColors = [
      { r: 100, g: 150, b: 200 }, // Blue
      { r: 200, g: 100, b: 150 }, // Pink
      { r: 150, g: 200, b: 100 }, // Green
      { r: 200, g: 150, b: 100 }, // Orange
      { r: 150, g: 100, b: 200 }, // Purple
    ];

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const color = testColors[i % testColors.length];
      
      try {
        // Create a test image with the color
        const testImageBuffer = await sharp({
          create: {
            width: 100,
            height: 100,
            channels: 3,
            background: color
          }
        }).png().toBuffer();

        // Generate blurhash
        const { data, info } = await sharp(testImageBuffer)
          .resize(32, 32, { fit: 'cover' })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
        
        // Update photo with blurhash
        await prisma.photo.update({
          where: { id: photo.id },
          data: { blurhash },
        });

        console.log(`✅ Generated blurhash for ${photo.filename}: ${blurhash}`);
      } catch (error) {
        console.error(`❌ Error processing ${photo.filename}:`, error);
      }
    }

    console.log('🎉 Sample blurhash generation completed!');
    
  } catch (error) {
    console.error('❌ Error generating sample blurhashes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Check command line arguments
const command = process.argv[2];

if (command === 'test') {
  testBlurhashGeneration();
} else if (command === 'samples') {
  generateSampleBlurhashes();
} else {
  console.log('Usage:');
  console.log('  npm run tsx scripts/blurhash-test.ts test     - Test blurhash generation');
  console.log('  npm run tsx scripts/blurhash-test.ts samples - Generate sample blurhashes');
}
