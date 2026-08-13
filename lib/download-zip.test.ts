import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const getObject = vi.fn();

vi.mock('@/lib/s3', () => ({
  S3Service: class {
    getObject(key: string) {
      return getObject(key);
    }
  },
}));

const { writeZip } = await import('./download-zip');

let tmpDir: string;

beforeEach(() => {
  getObject.mockReset();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const out = () => path.join(tmpDir, 'out.zip');

describe('writeZip', () => {
  it('writes a zip containing every item', async () => {
    getObject.mockImplementation(async (key: string) => Buffer.from(`body-of-${key}`));

    await writeZip(out(), [
      { name: 'a.jpg', s3Key: 'k/a' },
      { name: 'b.jpg', s3Key: 'k/b' },
    ]);

    const buf = fs.readFileSync(out());
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // local file header magic
    expect(buf.includes(Buffer.from('a.jpg'))).toBe(true);
    expect(buf.includes(Buffer.from('b.jpg'))).toBe(true);
    // Stored, not deflated, so the payload appears verbatim.
    expect(buf.includes(Buffer.from('body-of-k/a'))).toBe(true);
  });

  it('reports progress once per item', async () => {
    getObject.mockResolvedValue(Buffer.from('x'));
    const seen: number[] = [];

    await writeZip(
      out(),
      ['a', 'b', 'c'].map((n) => ({ name: `${n}.jpg`, s3Key: n })),
      { onProgress: (p) => { seen.push(p); } }
    );

    expect(seen).toEqual([1, 2, 3]);
  });

  it('skips objects that fail to fetch instead of failing the archive', async () => {
    getObject.mockImplementation(async (key: string) => {
      if (key === 'missing') throw new Error('404');
      return Buffer.from('ok');
    });

    await writeZip(out(), [
      { name: 'good.jpg', s3Key: 'good' },
      { name: 'gone.jpg', s3Key: 'missing' },
    ]);

    const buf = fs.readFileSync(out());
    expect(buf.includes(Buffer.from('good.jpg'))).toBe(true);
    expect(buf.includes(Buffer.from('gone.jpg'))).toBe(false);
  });

  it('still counts skipped objects as processed', async () => {
    getObject.mockRejectedValue(new Error('nope'));
    const seen: number[] = [];

    await writeZip(out(), [{ name: 'a.jpg', s3Key: 'a' }], {
      onProgress: (p) => { seen.push(p); },
    });

    expect(seen).toEqual([1]);
  });

  it('aborts partway when the signal is already aborted', async () => {
    getObject.mockResolvedValue(Buffer.from('x'));
    const controller = new AbortController();
    controller.abort();

    await expect(
      writeZip(out(), [{ name: 'a.jpg', s3Key: 'a' }], { signal: controller.signal })
    ).rejects.toThrow(/aborted/i);

    expect(getObject).not.toHaveBeenCalled();
  });

  it('produces a zip whose payload is not inflated by the in-flight gate', async () => {
    // 12 x 4MB exceeds the 32MB in-flight cap, so the gate engages; the archive must
    // still contain every entry.
    const chunk = Buffer.alloc(4 * 1024 * 1024, 1);
    getObject.mockResolvedValue(chunk);

    const items = Array.from({ length: 12 }, (_, i) => ({
      name: `p${i}.jpg`,
      s3Key: `k${i}`,
    }));

    await writeZip(out(), items);

    const size = fs.statSync(out()).size;
    expect(size).toBeGreaterThan(items.length * chunk.length);
    expect(getObject).toHaveBeenCalledTimes(12);
  });
});
