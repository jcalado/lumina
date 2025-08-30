#!/usr/bin/env tsx

import 'dotenv/config'
import { Worker, QueueEvents } from 'bullmq'
import os from 'os'
import { generateVideoThumbnails } from '@/lib/video-thumbnails'

const connection = () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
  }
}

const defaultConcurrency = Math.max(1, (os.cpus()?.length || 2) - 1)
const concurrency = Number(process.env.VIDEO_THUMBNAIL_CONCURRENCY || defaultConcurrency)

const worker = new Worker('video-thumbnails', async (job) => {
  const data = job.data as {
    videoId: string
    originalPath: string
    s3Key: string
    albumPath: string
    filename: string
    reprocess?: boolean
  }
  return generateVideoThumbnails(data)
}, { connection: connection(), concurrency })

const events = new QueueEvents('video-thumbnails', { connection: connection() })

worker.on('completed', (job) => {
  console.log(`Video thumbnail job completed: ${job.id}`)
})
worker.on('failed', (job, err) => {
  console.error(`Video thumbnail job failed: ${job?.id}`, err)
})

events.on('waiting', ({ jobId }) => console.log('Video Job waiting', jobId))
events.on('active', ({ jobId }) => console.log('Video Job active', jobId))
events.on('completed', ({ jobId }) => console.log('Video Job completed', jobId))
events.on('failed', ({ jobId, failedReason }) => console.error('Video Job failed', jobId, failedReason))

console.log(`Video thumbnail queue worker started (concurrency=${concurrency})`)

