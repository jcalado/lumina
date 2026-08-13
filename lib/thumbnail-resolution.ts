/**
 * Shared nearest-size thumbnail resolution for the photo and video serve routes.
 *
 * Both routes used to match the requested size exactly and, on a miss, silently fall
 * back to the full-resolution original — so a 300px grid tile could pull a multi-MB
 * original whenever the thumbnail worker was behind. This picks the closest available
 * thumbnail instead, and reports whether the match was exact so callers can decide how
 * aggressively to cache the response.
 *
 * Ordering only. The pixel dimensions for each size live in THUMBNAIL_SIZES
 * (lib/thumbnails.ts); that module pulls in sharp, so it is deliberately not imported
 * here — this stays a dependency-free pure function.
 */

/** Smallest to largest. Matches the ThumbnailSize enum in prisma/schema.prisma. */
const SIZE_ORDER = ['SMALL', 'MEDIUM', 'LARGE'] as const;

export type ThumbnailSizeName = (typeof SIZE_ORDER)[number];

export interface ResolvableThumbnail {
  size: string;
  s3Key: string;
}

export interface ResolvedThumbnail {
  s3Key: string;
  /** True when the returned thumbnail is exactly the size that was requested. */
  exact: boolean;
}

/** Normalises a caller-supplied `?size=` value to a known size name, or null. */
export function normalizeSize(requested: string): ThumbnailSizeName | null {
  const upper = requested.toUpperCase();
  return (SIZE_ORDER as readonly string[]).includes(upper)
    ? (upper as ThumbnailSizeName)
    : null;
}

/**
 * Picks the best available thumbnail for a requested size.
 *
 * Preference order: exact match, then the next size up (better to downscale a slightly
 * larger image than to upscale a smaller one), then the largest available size below.
 *
 * Returns null when there are no usable thumbnails at all, or when `requested` is not a
 * recognised size — callers handle that case explicitly rather than getting the original
 * by accident.
 */
export function resolveThumbnail(
  thumbnails: ResolvableThumbnail[],
  requested: string
): ResolvedThumbnail | null {
  const target = normalizeSize(requested);
  if (!target) return null;

  const available = new Map<string, string>();
  for (const t of thumbnails) {
    if (!t?.s3Key) continue;
    const name = normalizeSize(t.size);
    if (name) available.set(name, t.s3Key);
  }
  if (available.size === 0) return null;

  const exactKey = available.get(target);
  if (exactKey) return { s3Key: exactKey, exact: true };

  const targetIndex = SIZE_ORDER.indexOf(target);

  // Next size up, ascending.
  for (let i = targetIndex + 1; i < SIZE_ORDER.length; i++) {
    const key = available.get(SIZE_ORDER[i]);
    if (key) return { s3Key: key, exact: false };
  }

  // Otherwise the largest available below the requested size.
  for (let i = targetIndex - 1; i >= 0; i--) {
    const key = available.get(SIZE_ORDER[i]);
    if (key) return { s3Key: key, exact: false };
  }

  return null;
}

/** Long-lived caching is only safe when the bytes match what was asked for. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Short TTL for substituted or redirected responses, so clients pick up the real
 * thumbnail once the worker generates it instead of holding a stand-in for a year.
 */
export const PROVISIONAL_CACHE_CONTROL = 'public, max-age=60';
