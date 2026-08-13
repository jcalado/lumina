import { describe, it, expect } from 'vitest';
import {
  normalizeSize,
  resolveThumbnail,
  type ResolvableThumbnail,
} from './thumbnail-resolution';

const t = (size: string, s3Key = `${size.toLowerCase()}.jpg`): ResolvableThumbnail => ({
  size,
  s3Key,
});

describe('normalizeSize', () => {
  it('accepts known sizes case-insensitively', () => {
    expect(normalizeSize('small')).toBe('SMALL');
    expect(normalizeSize('MEDIUM')).toBe('MEDIUM');
    expect(normalizeSize('Large')).toBe('LARGE');
  });

  it('rejects unknown sizes', () => {
    expect(normalizeSize('original')).toBeNull();
    expect(normalizeSize('xlarge')).toBeNull();
    expect(normalizeSize('')).toBeNull();
  });
});

describe('resolveThumbnail', () => {
  it('prefers an exact match and reports it as exact', () => {
    const got = resolveThumbnail([t('SMALL'), t('MEDIUM'), t('LARGE')], 'medium');
    expect(got).toEqual({ s3Key: 'medium.jpg', exact: true });
  });

  it('falls up to the next larger size when the exact one is missing', () => {
    const got = resolveThumbnail([t('MEDIUM'), t('LARGE')], 'small');
    expect(got).toEqual({ s3Key: 'medium.jpg', exact: false });
  });

  it('skips gaps when falling up', () => {
    const got = resolveThumbnail([t('LARGE')], 'small');
    expect(got).toEqual({ s3Key: 'large.jpg', exact: false });
  });

  it('falls down to the largest smaller size when nothing larger exists', () => {
    const got = resolveThumbnail([t('SMALL'), t('MEDIUM')], 'large');
    expect(got).toEqual({ s3Key: 'medium.jpg', exact: false });
  });

  it('prefers falling up over falling down', () => {
    const got = resolveThumbnail([t('SMALL'), t('LARGE')], 'medium');
    expect(got).toEqual({ s3Key: 'large.jpg', exact: false });
  });

  it('returns null when there are no thumbnails — never the original', () => {
    expect(resolveThumbnail([], 'small')).toBeNull();
  });

  it('returns null for an unrecognised requested size', () => {
    expect(resolveThumbnail([t('SMALL')], 'original')).toBeNull();
    expect(resolveThumbnail([t('SMALL')], 'huge')).toBeNull();
  });

  it('ignores rows with an unknown size or an empty key', () => {
    expect(resolveThumbnail([{ size: 'TINY', s3Key: 'tiny.jpg' }], 'small')).toBeNull();
    expect(resolveThumbnail([{ size: 'SMALL', s3Key: '' }], 'small')).toBeNull();
  });

  it('handles lowercase size values from the database', () => {
    const got = resolveThumbnail([t('small')], 'small');
    expect(got).toEqual({ s3Key: 'small.jpg', exact: true });
  });
});
