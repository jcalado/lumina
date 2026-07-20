import { describe, it, expect } from 'vitest';
import { generateDropboxToken } from './token';

describe('generateDropboxToken', () => {
  it('returns a 21-char url-safe token', () => {
    const t = generateDropboxToken();
    expect(t).toHaveLength(21);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it('returns unique tokens', () => {
    expect(generateDropboxToken()).not.toBe(generateDropboxToken());
  });
});
