import { createHash } from 'node:crypto';
import IORedis from 'ioredis';

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
  return redis;
}

const PLACEHOLDER_SALT = 'change-me-to-a-long-random-string';

export function hashIp(ip: string): string {
  const salt = process.env.DROPBOX_IP_HASH_SALT || '';
  // Fail closed in production: an empty/placeholder salt makes the hash trivially
  // reversible over the IPv4 space, defeating the "IP stored only as a salted hash"
  // guarantee. In dev we tolerate it.
  if ((!salt || salt === PLACEHOLDER_SALT) && process.env.NODE_ENV === 'production') {
    throw new Error('DROPBOX_IP_HASH_SALT must be set to a non-placeholder value in production');
  }
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Fixed-window limiter. Returns true if the request is allowed. */
export async function checkRateLimit(
  key: string,
  opts: { limit?: number; windowSeconds?: number } = {}
): Promise<boolean> {
  const limit = opts.limit ?? 20;
  const windowSeconds = opts.windowSeconds ?? 3600;
  const redisKey = `dropbox:rl:${key}`;
  const r = getRedis();
  const count = await r.incr(redisKey);
  if (count === 1) await r.expire(redisKey, windowSeconds);
  return count <= limit;
}
