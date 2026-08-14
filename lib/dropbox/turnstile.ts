const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare rejects a malformed `remoteip`, so only forward a real address. */
function isIpAddress(value: string): boolean {
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(value) || /^[0-9a-f:]+$/i.test(value);
}

/**
 * Whether the widget is expected on the client. The site key is what makes the
 * browser render a widget and produce a token; the secret is what makes the
 * server demand one. Configuring only the secret rejects every upload with
 * "Verification failed", so callers surface that as a broken deploy instead.
 */
export function turnstileConfig(): { siteKey: string; secretConfigured: boolean; misconfigured: boolean } {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
  const secretConfigured = !!process.env.TURNSTILE_SECRET_KEY;
  return { siteKey, secretConfigured, misconfigured: secretConfigured && !siteKey };
}

export async function verifyTurnstile(token: string | null, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed in production; allow only if a dev explicitly leaves it unset in non-prod.
    if (process.env.NODE_ENV === 'production') {
      console.error('[turnstile] TURNSTILE_SECRET_KEY is unset in production; rejecting upload');
      return false;
    }
    return true;
  }
  if (!token) {
    // Almost always NEXT_PUBLIC_TURNSTILE_SITE_KEY missing, so no widget rendered.
    console.error('[turnstile] no token supplied by the client; is NEXT_PUBLIC_TURNSTILE_SITE_KEY set?');
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp && isIpAddress(remoteIp)) body.set('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success !== true) {
      // timeout-or-duplicate => a reused/expired token; invalid-input-secret =>
      // the secret does not pair with the site key the widget was built from.
      console.error('[turnstile] verification rejected:', data['error-codes'] ?? 'no error codes');
      return false;
    }
    return true;
  } catch (e) {
    console.error('[turnstile] siteverify request failed:', e);
    return false;
  }
}
