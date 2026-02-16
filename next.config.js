const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    'sharp',
    '@prisma/client',
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
  // Increase request size limits for file uploads
  serverRuntimeConfig: {
    maxRequestSize: '2gb',
  },
  images: {
    minimumCacheTTL: 31536000, // 1 year - photos are immutable
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
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
