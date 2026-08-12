const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    'sharp',
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    'bullmq',
    'ioredis',
    'canvas',
    'fluent-ffmpeg',
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@radix-ui/react-icons'],
  },
  // Enable standalone output for Docker
  output: 'standalone',
  images: {
    minimumCacheTTL: 31536000, // 1 year - photos are immutable
    // Left unset, Next sizes the optimizer's disk LRU at 50% of free disk, so with a
    // 1-year TTL nothing is ever evicted. On boot the LRU is rebuilt by reading every
    // cached entry off disk, serially, and the first cache write blocks on that scan --
    // which is what took the optimizer down in production once the cache had grown.
    maximumDiskCacheSize: 512 * 1024 * 1024, // 512MB
    // Dev only: the optimizer fetches thumbnails from the MinIO container, whose
    // address is private. Left off in production, where storage is public HTTPS.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
    localPatterns: [
      {
        pathname: '/api/photos/**',
      },
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      // Dev only: local MinIO serves thumbnails over plain http on localhost.
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [
            { protocol: 'http', hostname: 'localhost' },
            { protocol: 'http', hostname: '*.localhost' },
          ]),
    ],
    formats: ['image/webp', 'image/avif'],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
