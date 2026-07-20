import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstile } from './turnstile';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('verifyTurnstile', () => {
  it('returns false for a missing token', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    expect(await verifyTurnstile(null)).toBe(false);
  });
  it('returns true when Cloudflare says success', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: true }) })));
    expect(await verifyTurnstile('tok')).toBe(true);
  });
  it('returns false when Cloudflare says failure', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ success: false }) })));
    expect(await verifyTurnstile('tok')).toBe(false);
  });
  it('fails closed in production when secret is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    expect(await verifyTurnstile('tok')).toBe(false);
  });
});
