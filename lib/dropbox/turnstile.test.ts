import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstile, turnstileConfig } from './turnstile';

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
  it('forwards a real client IP but not the "unknown" placeholder', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    const sent: Array<string | null> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: URLSearchParams }) => {
      expect(url).toContain('/siteverify');
      sent.push(init.body.get('remoteip'));
      return { json: async () => ({ success: true }) };
    }));

    await verifyTurnstile('tok', '203.0.113.7');
    await verifyTurnstile('tok', 'unknown');
    expect(sent).toEqual(['203.0.113.7', null]);
  });
});

describe('turnstileConfig', () => {
  it('flags a secret configured without a site key', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(turnstileConfig().misconfigured).toBe(true);
  });
  it('is not misconfigured when both keys are present', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'x');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site');
    expect(turnstileConfig().misconfigured).toBe(false);
  });
  it('is not misconfigured when Turnstile is fully disabled', () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(turnstileConfig().misconfigured).toBe(false);
  });
});
