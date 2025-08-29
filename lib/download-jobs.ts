import path from 'path';
import os from 'os';
import fs from 'fs';
import archiver from 'archiver';
import { prisma } from '@/lib/prisma';
import { slugPathToPath } from '@/lib/slug-paths';
import { S3Service } from '@/lib/s3';

export type DownloadStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface DownloadJob {
  token: string;
  type: 'album' | 'photos';
  albumPath?: string;
  photoIds?: string[];
  status: DownloadStatus;
  total: number;
  processed: number;
  createdAt: Date;
  expiresAt: Date;
  filePath?: string;
  filename?: string;
  error?: string;
}

export const TMP_DIR = path.join(os.tmpdir(), 'lumina-downloads');
if (!fs.existsSync(TMP_DIR)) {
  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch {}
}

const jobs = new Map<string, DownloadJob>();
const s3 = new S3Service();

function scheduleExpiryCleanup(job: DownloadJob) {
  const ms = Math.max(0, job.expiresAt.getTime() - Date.now());
  setTimeout(() => {
    const j = jobs.get(job.token);
    if (!j) return;
    j.status = 'EXPIRED';
    if (j.filePath && fs.existsSync(j.filePath)) {
      try { fs.unlinkSync(j.filePath); } catch {}
    }
    jobs.delete(job.token);
  }, ms);
}

export function getJob(token: string): DownloadJob | undefined {
  return jobs.get(token);
}

export function getZipPath(token: string): string {
  return path.join(TMP_DIR, `${token}.zip`);
}

export function createAlbumJob(token: string, albumPath: string): DownloadJob {
  const job: DownloadJob = {
    token,
    type: 'album',
    albumPath,
    status: 'PENDING',
    total: 0,
    processed: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h
  };
  jobs.set(token, job);
  scheduleExpiryCleanup(job);
  startAlbumJob(job).catch((e) => {
    job.status = 'FAILED';
    job.error = e instanceof Error ? e.message : String(e);
  });
  return job;
}

export function createPhotosJob(token: string, photoIds: string[]): DownloadJob {
  const job: DownloadJob = {
    token,
    type: 'photos',
    photoIds,
    status: 'PENDING',
    total: photoIds.length,
    processed: 0,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  };
  jobs.set(token, job);
  scheduleExpiryCleanup(job);
  startPhotosJob(job).catch((e) => {
    job.status = 'FAILED';
    job.error = e instanceof Error ? e.message : String(e);
  });
  return job;
}

async function startAlbumJob(job: DownloadJob) {
  if (!job.albumPath) throw new Error('Missing albumPath');
  job.status = 'RUNNING';

  // Support receiving slug-paths by converting to filesystem path
  let resolvedPath = job.albumPath;
  try {
    const maybePath = await slugPathToPath(job.albumPath);
    if (maybePath) resolvedPath = maybePath;
  } catch {}

  const album = await prisma.album.findFirst({
    where: { path: resolvedPath },
    select: { name: true, photos: { select: { id: true, filename: true, s3Key: true } } },
  });
  if (!album) throw new Error('Album not found');
  if (!album.photos || album.photos.length === 0) throw new Error('Album has no photos');

  job.total = album.photos.length;
  const safeName = album.name.replace(/[^a-zA-Z0-9\-_\s]/g, '');
  const filename = `${safeName}-photos.zip`;
  const outPath = path.join(TMP_DIR, `${job.token}.zip`);
  await writeZip(outPath, filename, album.photos.map(p => ({ name: p.filename, s3Key: p.s3Key })), job);
}

async function startPhotosJob(job: DownloadJob) {
  if (!job.photoIds || job.photoIds.length === 0) throw new Error('No photo IDs provided');
  job.status = 'RUNNING';
  const photos = await prisma.photo.findMany({
    where: { id: { in: job.photoIds } },
    select: { id: true, filename: true, s3Key: true },
  });
  if (photos.length === 0) throw new Error('No photos found');
  job.total = photos.length;
  const filename = `selected-photos-${job.token}.zip`;
  const outPath = path.join(TMP_DIR, `${job.token}.zip`);
  await writeZip(outPath, filename, photos.map(p => ({ name: p.filename, s3Key: p.s3Key })), job);
}

async function writeZip(outPath: string, filename: string, items: Array<{ name: string; s3Key: string }>, job: DownloadJob) {
  job.filename = filename;
  job.processed = 0;

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('warning', (err) => {
      if ((err as any).code === 'ENOENT') {
        // log warning
        // eslint-disable-next-line no-console
        console.warn('Archive warning', err);
      } else {
        reject(err);
      }
    });
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    (async () => {
      for (const item of items) {
        try {
          const buf = await s3.getObject(item.s3Key);
          archive.append(buf, { name: item.name });
        } catch (e) {
          // skip failed item
        }
        job.processed += 1;
      }
      await archive.finalize();
    })().catch(reject);
  });

  job.filePath = outPath;
  job.status = 'COMPLETED';
}
