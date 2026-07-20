import { describe, it, expect, vi, afterEach } from 'vitest';
import { hashIp, getClientIp } from './rate-limit';

afterEach(() => vi.unstubAllEnvs());

describe('hashIp', () => {
  it('is deterministic, salted, and not the raw IP', () => {
    vi.stubEnv('DROPBOX_IP_HASH_SALT', 'salt');
    const a = hashIp('1.2.3.4');
    expect(a).toBe(hashIp('1.2.3.4'));
    expect(a).not.toContain('1.2.3.4');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('getClientIp', () => {
  it('reads x-forwarded-for first ip', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });
  it('falls back to unknown', () => {
    expect(getClientIp(new Request('http://x'))).toBe('unknown');
  });
});
