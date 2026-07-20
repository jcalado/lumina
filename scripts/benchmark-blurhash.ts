#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { createPrismaClient } from '../lib/prisma-client';

// Import both versions
import { startBlurhashJob } from './blurhash-worker';
// Note: We'll need to export the parallel function from the worker-thread file

const prisma = createPrismaClient();

async function benchmarkBlurhashProcessing() {
  console.log('🧪 Blurhash Processing Benchmark');
  console.log('=================================');

  try {
    // Get count of photos without blurhash
    const photosWithoutBlurhash = await prisma.photo.count({
      where: { blurhash: null }
    });

    console.log(`📊 Photos without blurhash: ${photosWithoutBlurhash}`);

    if (photosWithoutBlurhash === 0) {
      console.log('ℹ️  No photos need blurhash processing');
      return;
    }

    if (photosWithoutBlurhash > 100) {
      console.log('⚠️  Large dataset detected. Consider running on a smaller subset for benchmarking.');
      console.log('   You can manually limit photos in the database for testing purposes.');
    }

    console.log('\n🔄 Processing will start in 5 seconds...');
    console.log('   Press Ctrl+C to cancel');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Test original implementation
    console.log('\n📍 Testing ORIGINAL implementation (sequential with batching)...');
    const startOriginal = performance.now();
    
    await startBlurhashJob();
    
    const endOriginal = performance.now();
    const originalTime = (endOriginal - startOriginal) / 1000;

    console.log(`✅ Original implementation completed in ${originalTime.toFixed(2)} seconds`);

    // Reset photos for second test (remove blurhash)
    await prisma.photo.updateMany({
      where: { blurhash: { not: null } },
      data: { blurhash: null }
    });

    console.log('\n📍 Testing PARALLELIZED implementation (worker threads)...');
    const startParallel = performance.now();
    
    // Import and run parallel version
    const { startBlurhashJobParallel } = await import('./blurhash-parallel');
    await startBlurhashJobParallel();
    
    const endParallel = performance.now();
    const parallelTime = (endParallel - startParallel) / 1000;

    console.log(`✅ Parallelized implementation completed in ${parallelTime.toFixed(2)} seconds`);

    // Calculate performance improvement
    const improvement = ((originalTime - parallelTime) / originalTime) * 100;
    const speedup = originalTime / parallelTime;

    console.log('\n📊 BENCHMARK RESULTS');
    console.log('===================');
    console.log(`Original time:     ${originalTime.toFixed(2)}s`);
    console.log(`Parallelized time: ${parallelTime.toFixed(2)}s`);
    console.log(`Performance gain:  ${improvement.toFixed(1)}%`);
    console.log(`Speed improvement: ${speedup.toFixed(2)}x faster`);

    if (improvement > 0) {
      console.log(`🚀 Parallelized version is ${speedup.toFixed(2)}x faster!`);
    } else {
      console.log(`⚠️  Parallelized version was slower. This could be due to overhead or system constraints.`);
    }

    console.log('\n💡 Notes:');
    console.log('- Results may vary based on CPU cores, I/O speed, and dataset size');
    console.log('- Parallel processing is most effective with sufficient CPU cores');
    console.log('- Network latency to S3 may limit improvements for remote files');

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run benchmark if called directly
if (require.main === module) {
  benchmarkBlurhashProcessing();
}

export { benchmarkBlurhashProcessing };
