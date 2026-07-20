import { createHash } from 'node:crypto';
import IORedis from 'ioredis';

let redis: IORedis | null = null;
function getRedis(): IORedis {
  if (!redis) redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
  return redis;
}

export function hashIp(ip: string): string {
  const salt = process.env.DROPBOX_IP_HASH_SALT || '';
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
