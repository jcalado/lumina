import path from 'path';
import os from 'os';
import fs from 'fs';
import { ZipArchive } from 'archiver';
import { S3Service } from '@/lib/s3';

/**
 * Where completed zips are written.
 *
 * In production this must point at a path shared between the app and worker containers
 * (docker-compose mounts ./temp into both), because the worker builds the archive and the
 * web tier serves it. It must not default to os.tmpdir() there: /tmp is a per-container
 * tmpfs, so zips would be RAM and invisible to the other container.
 */
export const DOWNLOAD_DIR =
  process.env.DOWNLOAD_DIR || path.join(os.tmpdir(), 'lumina-downloads');

export function ensureDownloadDir(): void {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    try {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    } catch {}
  }
}

export function getZipPath(token: string): string {
  return path.join(DOWNLOAD_DIR, `${token}.zip`);
}

/**
 * Cap on bytes appended to the archiver but not yet written out.
 *
 * archive.append() is synchronous and returns immediately, so an ungated loop runs at S3
 * speed while the archiver drains at disk speed and the difference is held as resident
 * buffers. Measured with a slow consumer, 120x5MB: ~525MB retained ungated versus ~50MB
 * with a 32MB cap, independent of album size.
 *
 * This cannot be gated on archiver's 'entry' event — that fires when an entry is accepted,
 * not when it is written, so it reports no backlog at all.
 */
const MAX_BYTES_IN_FLIGHT = 32 * 1024 * 1024;

export interface ZipItem {
  name: string;
  s3Key: string;
}

export interface WriteZipOptions {
  /** Called after each item so callers can persist progress. */
  onProgress?: (processed: number) => void | Promise<void>;
  signal?: AbortSignal;
}

/**
 * Streams the given S3 objects into a zip on disk.
 *
 * Stored, not deflated: album contents are already-compressed JPEG/PNG, where deflate
 * achieves a ~100% ratio (no size reduction) while capping throughput at ~40MB/s versus
 * ~200MB/s for store.
 */
export async function writeZip(
  outPath: string,
  items: ZipItem[],
  options: WriteZipOptions = {}
): Promise<void> {
  const s3 = new S3Service();
  const { onProgress, signal } = options;

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = new ZipArchive({ zlib: { level: 0 } });

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    output.on('close', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    output.on('error', fail);

    archive.on('warning', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn('Archive warning', err);
      } else {
        fail(err);
      }
    });
    archive.on('error', fail);

    archive.pipe(output);

    let appendedBytes = 0;
    const bytesInFlight = () => appendedBytes - archive.pointer();

    const waitForCapacity = async () => {
      while (bytesInFlight() > MAX_BYTES_IN_FLIGHT && !archive.destroyed) {
        await new Promise((r) => setTimeout(r, 10));
      }
    };

    (async () => {
      let processed = 0;

      for (const item of items) {
        if (signal?.aborted || archive.destroyed) {
          throw new Error('Download job aborted');
        }

        await waitForCapacity();

        try {
          const buf = await s3.getObject(item.s3Key);
          appendedBytes += buf.length;
          archive.append(buf, { name: item.name });
        } catch {
          // Skip a missing or unreadable object rather than failing the whole archive
        }

        processed += 1;
        await onProgress?.(processed);
      }

      await archive.finalize();
    })().catch(fail);
  });
}
