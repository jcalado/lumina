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

let videoThumbnailQueue: Queue | null = null

export function getVideoThumbnailQueue(): Queue {
  if (!videoThumbnailQueue) {
    videoThumbnailQueue = new Queue('video-thumbnails', { connection: connection() })
  }
  return videoThumbnailQueue!
}

export async function enqueueVideoThumbnailJob(data: any) {
  const queue = getVideoThumbnailQueue()
  return queue.add('generate', data, {
    attempts: 3,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  })
}

