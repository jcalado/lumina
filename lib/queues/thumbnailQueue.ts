import { Queue, JobsOptions } from 'bullmq'

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

let thumbnailQueue: Queue | null = null

export function getThumbnailQueue(): Queue {
  if (!thumbnailQueue) {
    thumbnailQueue = new Queue('thumbnails', { connection: connection() })
  }
  return thumbnailQueue!
}

export async function enqueueThumbnailJob(data: any, opts: JobsOptions = {}) {
  const queue = getThumbnailQueue()
  return queue.add('generate', data, {
    attempts: 3,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    ...opts,
  })
}

