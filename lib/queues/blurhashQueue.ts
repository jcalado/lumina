import { Queue } from 'bullmq'

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

let blurhashQueue: Queue | null = null

export function getBlurhashQueue(): Queue {
  if (!blurhashQueue) {
    blurhashQueue = new Queue('blurhash', { connection: connection() })
  }
  return blurhashQueue!
}

export async function enqueueBlurhashJob(data: { photoId: string; s3Key: string; filename?: string }) {
  const queue = getBlurhashQueue()
  return queue.add('generate', data, {
    attempts: 3,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  })
}

