import { prisma } from '@/lib/prisma'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import Redis from 'ioredis'

export interface HealthCheckResult {
  status: 'online' | 'degraded' | 'offline'
  latencyMs?: number
  details?: string
}

export async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'online', latencyMs: Date.now() - start }
  } catch (error) {
    return {
      status: 'offline',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function checkS3(): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const { S3Client } = await import('@aws-sdk/client-s3')
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: true,
    })
    const bucket = process.env.S3_BUCKET
    if (!bucket) {
      return { status: 'offline', details: 'S3_BUCKET not configured' }
    }
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { status: 'online', latencyMs: Date.now() - start }
  } catch (error) {
    return {
      status: 'offline',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now()
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return { status: 'offline', details: 'REDIS_URL not configured' }
  }

  let client: Redis | null = null
  try {
    client = new Redis(redisUrl, {
      connectTimeout: 3000,
      lazyConnect: true,
    })
    await client.connect()
    const result = await client.ping()
    if (result === 'PONG') {
      return { status: 'online', latencyMs: Date.now() - start }
    }
    return { status: 'degraded', latencyMs: Date.now() - start, details: `Unexpected ping response: ${result}` }
  } catch (error) {
    return {
      status: 'offline',
      latencyMs: Date.now() - start,
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    if (client) {
      try { client.disconnect() } catch {}
    }
  }
}

export async function checkBackgroundJobs(): Promise<HealthCheckResult> {
  const redis = await checkRedis()
  if (redis.status === 'offline') {
    return { status: 'offline', details: 'Redis unavailable (required for job queue)' }
  }
  return { status: redis.status, latencyMs: redis.latencyMs, details: 'Queue broker reachable' }
}

export async function getAllHealthChecks() {
  const [database, s3, redis, jobs] = await Promise.all([
    checkDatabase(),
    checkS3(),
    checkRedis(),
    checkBackgroundJobs(),
  ])

  return { database, s3, redis, jobs }
}
