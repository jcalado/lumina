import { describe, it, expect } from 'vitest';
import { resolveMediaKind, sanitizeFilename, validateDeclaredFiles, submissionMetaSchema } from './validation';

const opts = { maxFiles: 3, maxFileSizeBytes: 1000, allowVideos: true };

describe('resolveMediaKind', () => {
  it('detects image/video/unknown', () => {
    expect(resolveMediaKind('a.JPG')).toBe('IMAGE');
    expect(resolveMediaKind('a.mov')).toBe('VIDEO');
    expect(resolveMediaKind('a.exe')).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips unsafe chars and whitespace', () => {
    expect(sanitizeFilename('my photo:v2?.jpg')).toBe('my_photo_v2_.jpg');
  });
});

describe('validateDeclaredFiles', () => {
  it('accepts a valid set', () => {
    expect(validateDeclaredFiles([{ filename: 'a.jpg', contentType: 'image/jpeg', size: 500 }], opts).ok).toBe(true);
  });
  it('rejects too many files', () => {
    const files = Array.from({ length: 4 }, (_, i) => ({ filename: `f${i}.jpg`, contentType: 'image/jpeg', size: 10 }));
    expect(validateDeclaredFiles(files, opts)).toMatchObject({ ok: false });
  });
  it('rejects oversized files', () => {
    expect(validateDeclaredFiles([{ filename: 'a.jpg', contentType: 'image/jpeg', size: 2000 }], opts)).toMatchObject({ ok: false });
  });
  it('rejects videos when allowVideos is false', () => {
    expect(validateDeclaredFiles([{ filename: 'a.mp4', contentType: 'video/mp4', size: 10 }], { ...opts, allowVideos: false })).toMatchObject({ ok: false });
  });
  it('rejects unknown types', () => {
    expect(validateDeclaredFiles([{ filename: 'a.exe', contentType: 'application/octet-stream', size: 10 }], opts)).toMatchObject({ ok: false });
  });
  it('rejects an empty set', () => {
    expect(validateDeclaredFiles([], opts)).toMatchObject({ ok: false });
  });
});

describe('submissionMetaSchema', () => {
  it('accepts empty and valid email; rejects bad email', () => {
    expect(submissionMetaSchema.safeParse({}).success).toBe(true);
    expect(submissionMetaSchema.safeParse({ uploaderEmail: 'x@y.com' }).success).toBe(true);
    expect(submissionMetaSchema.safeParse({ uploaderEmail: 'nope' }).success).toBe(false);
  });
});
