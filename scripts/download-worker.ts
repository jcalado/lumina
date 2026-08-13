import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Worker, QueueEvents } from 'bullmq'
import { prisma } from '../lib/prisma'
import { slugPathToPath } from '../lib/slug-paths'
import {
  writeZip,
  getZipPath,
  ensureDownloadDir,
  DOWNLOAD_DIR,
  type ZipItem,
} from '../lib/download-zip'

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

// Zip builds are IO- and memory-heavy and this container also runs the thumbnail, video
// thumbnail and blurhash workers at (cpus - 1) each. Serialise by default.
const concurrency = Math.max(1, Number(process.env.DOWNLOAD_CONCURRENCY || 1))

/** Progress is written at most this often, to keep a 5000-photo album off the DB. */
const PROGRESS_WRITE_INTERVAL_MS = 1000

async function collectItems(job: {
  type: string
  albumPath: string | null
  photoIds: string | null
}): Promise<{ items: ZipItem[]; filename: string }> {
  if (job.type === 'album') {
    if (!job.albumPath) throw new Error('Missing albumPath')

    // The client posts slug paths; fall back to treating it as a filesystem path.
    let resolvedPath = job.albumPath
    try {
      const maybePath = await slugPathToPath(job.albumPath)
      if (maybePath) resolvedPath = maybePath
    } catch {}

    const album = await prisma.album.findFirst({
      where: { path: resolvedPath },
      select: { name: true, photos: { select: { filename: true, s3Key: true } } },
    })
    if (!album) throw new Error('Album not found')
    if (!album.photos.length) throw new Error('Album has no photos')

    const safeName = album.name.replace(/[^a-zA-Z0-9\-_\s]/g, '')
    return {
      items: album.photos.map((p) => ({ name: p.filename, s3Key: p.s3Key })),
      filename: `${safeName}-photos.zip`,
    }
  }

  const photoIds: string[] = JSON.parse(job.photoIds || '[]')
  if (!photoIds.length) throw new Error('No photo IDs provided')

  const photos = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    select: { filename: true, s3Key: true },
  })
  if (!photos.length) throw new Error('No photos found')

  return {
    items: photos.map((p) => ({ name: p.filename, s3Key: p.s3Key })),
    filename: 'selected-photos.zip',
  }
}

async function processDownloadJob(bullJob: { data: { token: string } }) {
  const { token } = bullJob.data
  const job = await prisma.downloadJob.findUnique({ where: { token } })
  if (!job) throw new Error(`DownloadJob ${token} not found`)

  ensureDownloadDir()
  const outPath = getZipPath(token)

  try {
    const { items, filename } = await collectItems(job)

    await prisma.downloadJob.update({
      where: { token },
      data: { status: 'RUNNING', total: items.length, filename, processed: 0 },
    })

    let lastWrite = 0
    await writeZip(outPath, items, {
      onProgress: async (processed) => {
        const now = Date.now()
        if (processed < items.length && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return
        lastWrite = now
        await prisma.downloadJob.update({ where: { token }, data: { processed } })
      },
    })

    await prisma.downloadJob.update({
      where: { token },
      data: { status: 'COMPLETED', processed: items.length, filePath: outPath },
    })
    console.log(`[downloads] built ${filename} for ${token} (${items.length} items)`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.downloadJob.update({
      where: { token },
      data: { status: 'FAILED', error: message },
    })
    // Don't leave a half-written archive behind for the file route to serve.
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
    } catch {}
    throw error
  }
}

/**
 * Deletes expired zips and any file with no live job row.
 *
 * This replaces a per-job setTimeout in the old in-process implementation, which was lost
 * on every restart and so leaked files permanently.
 */
async function sweep() {
  ensureDownloadDir()

  try {
    const expired = await prisma.downloadJob.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { token: true },
    })

    for (const { token } of expired) {
      const file = getZipPath(token)
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch {}
    }

    if (expired.length) {
      await prisma.downloadJob.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      console.log(`[downloads] swept ${expired.length} expired job(s)`)
    }

    // Orphans: files on disk with no corresponding row, e.g. left by a hard kill.
    const live = await prisma.downloadJob.findMany({ select: { token: true } })
    const liveTokens = new Set(live.map((j) => j.token))
    for (const entry of fs.readdirSync(DOWNLOAD_DIR)) {
      if (!entry.endsWith('.zip')) continue
      if (liveTokens.has(path.basename(entry, '.zip'))) continue
      try {
        fs.unlinkSync(path.join(DOWNLOAD_DIR, entry))
        console.log(`[downloads] removed orphan ${entry}`)
      } catch {}
    }
  } catch (error) {
    console.error('[downloads] sweep failed', error)
  }
}

async function main() {
  ensureDownloadDir()
  console.log(`[downloads] worker starting, concurrency=${concurrency}, dir=${DOWNLOAD_DIR}`)

  await sweep()
  setInterval(sweep, 60 * 60 * 1000).unref()

  const worker = new Worker('downloads', processDownloadJob, {
    connection: connection(),
    concurrency,
  })

  worker.on('failed', (job, err) => {
    console.error(`[downloads] job ${job?.id} failed:`, err?.message)
  })

  const events = new QueueEvents('downloads', { connection: connection() })
  events.on('completed', ({ jobId }) => console.log(`[downloads] job ${jobId} completed`))

  const shutdown = async () => {
    console.log('[downloads] shutting down')
    await worker.close()
    await events.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  console.error('[downloads] worker crashed', error)
  process.exit(1)
})
