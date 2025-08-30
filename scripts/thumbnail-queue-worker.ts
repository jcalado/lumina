#!/usr/bin/env tsx

import 'dotenv/config'
import { Worker, QueueEvents } from 'bullmq'
import os from 'os'
import { generateThumbnails } from '@/lib/thumbnails'

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
const concurrency = Number(process.env.THUMBNAIL_CONCURRENCY || defaultConcurrency)

const worker = new Worker('thumbnails', async (job) => {
  const data = job.data as {
    photoId: string
    originalPath: string
    s3Key: string
    albumPath: string
    filename: string
    }
  return generateThumbnails(data)
}, { connection: connection(), concurrency })

const events = new QueueEvents('thumbnails', { connection: connection() })

worker.on('completed', (job) => {
  console.log(`Thumbnail job completed: ${job.id}`)
})
worker.on('failed', (job, err) => {
  console.error(`Thumbnail job failed: ${job?.id}`, err)
})

events.on('waiting', ({ jobId }) => console.log('Job waiting', jobId))
events.on('active', ({ jobId }) => console.log('Job active', jobId))
events.on('completed', ({ jobId }) => console.log('Job completed', jobId))
events.on('failed', ({ jobId, failedReason }) => console.error('Job failed', jobId, failedReason))

console.log(`Thumbnail queue worker started (concurrency=${concurrency})`)
