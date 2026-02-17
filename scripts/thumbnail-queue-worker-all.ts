#!/usr/bin/env tsx

import 'dotenv/config'
import os from 'os'
import { Worker, QueueEvents } from 'bullmq'
import { generateThumbnails } from '../lib/thumbnails'
import { generateVideoThumbnails } from '../lib/video-thumbnails'
import { processBlurhashForPhoto } from '../lib/blurhash'

function connection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
  }
}

const defaultCpu = Math.max(1, (os.cpus()?.length || 2) - 1)
const photoConcurrency = Number(process.env.THUMBNAIL_CONCURRENCY || defaultCpu)
const videoConcurrency = Number(process.env.VIDEO_THUMBNAIL_CONCURRENCY || defaultCpu)

// Photo thumbnails worker
const photoWorker = new Worker(
  'thumbnails',
  async (job) => {
    const data = job.data as {
      photoId: string
      s3Key: string
      albumPath: string
      filename: string
      reprocess?: boolean
    }
    return generateThumbnails(data)
  },
  { connection: connection(), concurrency: photoConcurrency }
)

const photoEvents = new QueueEvents('thumbnails', { connection: connection() })
photoWorker.on('completed', (job) => console.log(`[photos] completed ${job.id}`))
photoWorker.on('failed', (job, err) => console.error(`[photos] failed ${job?.id}:`, err))
photoEvents.on('waiting', ({ jobId }) => console.log('[photos] waiting', jobId))
photoEvents.on('active', ({ jobId }) => console.log('[photos] active', jobId))
photoEvents.on('completed', ({ jobId }) => console.log('[photos] completed', jobId))
photoEvents.on('failed', ({ jobId, failedReason }) => console.error('[photos] failed', jobId, failedReason))

// Video thumbnails worker
const videoWorker = new Worker(
  'video-thumbnails',
  async (job) => {
    const data = job.data as {
      videoId: string
      s3Key: string
      albumPath: string
      filename: string
      reprocess?: boolean
    }
    return generateVideoThumbnails(data)
  },
  { connection: connection(), concurrency: videoConcurrency }
)

const videoEvents = new QueueEvents('video-thumbnails', { connection: connection() })
videoWorker.on('completed', (job) => console.log(`[videos] completed ${job.id}`))
videoWorker.on('failed', (job, err) => console.error(`[videos] failed ${job?.id}:`, err))
videoEvents.on('waiting', ({ jobId }) => console.log('[videos] waiting', jobId))
videoEvents.on('active', ({ jobId }) => console.log('[videos] active', jobId))
videoEvents.on('completed', ({ jobId }) => console.log('[videos] completed', jobId))
videoEvents.on('failed', ({ jobId, failedReason }) => console.error('[videos] failed', jobId, failedReason))

console.log(`Thumbnail queue worker (photos=${photoConcurrency}, videos=${videoConcurrency}) started`)

// Blurhash worker
const blurhashConcurrency = Number(process.env.BLURHASH_CONCURRENCY || defaultCpu)
const blurhashWorker = new Worker(
  'blurhash',
  async (job) => {
    const data = job.data as { photoId: string; s3Key: string; filename?: string }
    return processBlurhashForPhoto(data)
  },
  { connection: connection(), concurrency: blurhashConcurrency }
)
const blurhashEvents = new QueueEvents('blurhash', { connection: connection() })
blurhashWorker.on('completed', (job) => console.log(`[blurhash] completed ${job.id}`))
blurhashWorker.on('failed', (job, err) => console.error(`[blurhash] failed ${job?.id}:`, err))
blurhashEvents.on('waiting', ({ jobId }) => console.log('[blurhash] waiting', jobId))
blurhashEvents.on('active', ({ jobId }) => console.log('[blurhash] active', jobId))
blurhashEvents.on('completed', ({ jobId }) => console.log('[blurhash] completed', jobId))
blurhashEvents.on('failed', ({ jobId, failedReason }) => console.error('[blurhash] failed', jobId, failedReason))

console.log(`Blurhash worker started (concurrency=${blurhashConcurrency})`)
