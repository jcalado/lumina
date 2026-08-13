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

let downloadQueue: Queue | null = null

export function getDownloadQueue(): Queue {
  if (!downloadQueue) {
    downloadQueue = new Queue('downloads', { connection: connection() })
  }
  return downloadQueue!
}

export interface DownloadJobData {
  token: string
}

export async function enqueueDownloadJob(data: DownloadJobData, opts: JobsOptions = {}) {
  const queue = getDownloadQueue()
  return queue.add('build', data, {
    // Zip builds are expensive and not idempotent from the user's point of view (a retry
    // restarts the whole archive), so unlike the thumbnail queue this does not retry.
    attempts: 1,
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
    ...opts,
  })
}
