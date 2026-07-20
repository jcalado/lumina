# Anonymous Dropbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, link-gated way for unauthenticated users to upload photos/videos into an isolated staging area that an admin reviews and approves into a destination album.

**Architecture:** Approach A — three dedicated staging models (`Dropbox`, `DropboxSubmission`, `DropboxFile`) plus a `_dropbox/` S3 prefix hold pending media, fully isolated from `Photo`/`Video`/`Album`. Public routes under `/submit` + `/api/dropbox/*` accept uploads behind Turnstile + passphrase + rate-limit + caps. Admin routes under `/api/admin/dropboxes/*` review and **promote-on-approve** (S3 move → create `Photo`/`Video` → enqueue existing processing queues).

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + PostgreSQL, BullMQ + ioredis workers, S3 (`lib/s3.ts`), Tailwind v4 + shadcn/ui, bcryptjs, nanoid, Cloudflare Turnstile, vitest (new).

## Global Constraints

- **Prisma 7:** never write bare `new PrismaClient()`. Import the singleton `import { prisma } from '@/lib/prisma'` in app code; scripts use `createPrismaClient()` from `@/lib/prisma-client`.
- **Datasource is PostgreSQL.** Schema has no `url` (it lives in `prisma.config.ts`).
- **Pending media isolation:** no `Photo` or `Video` row may be created until an admin approves a `DropboxFile`. Staging objects live under the S3 key prefix `_dropbox/`, which is outside every `album.path`.
- **IP privacy:** store only a salted hash of the uploader IP (`DROPBOX_IP_HASH_SALT`), never the raw IP.
- **Public routes never live under `/api/admin`.** Public: `/submit/*`, `/api/dropbox/*`. Admin: `/api/admin/dropboxes/*`, `/admin/dropboxes/*`.
- **Admin route guard:** `const session = await requireAdmin(); if (session instanceof NextResponse) return session;` (from `@/lib/admin-auth`).
- **Turnstile fails closed in production:** if `TURNSTILE_SECRET_KEY` is unset, `verifyTurnstile` returns `false` (uploads rejected) unless `NODE_ENV !== 'production'` AND the Cloudflare test secret is configured.
- **Next 16 route handlers:** dynamic params are async — `{ params }: { params: Promise<{ token: string }> }` and `const { token } = await params`.
- **Reuse, don't reinvent:** `lib/s3.ts` (`generateKey`, `getPresignedUploadUrl`, `getSignedUrl`, `objectExists`, `getObjectMetadata`, `deleteObject`), queues (`enqueueThumbnailJob`, `enqueueBlurhashJob`, `enqueueExifJob`, `enqueueVideoThumbnailJob`), media helpers (`isImageFile`, `isVideoFile`, `getContentType` from `@/lib/utils`).
- **Spec:** `docs/superpowers/specs/2026-07-20-anonymous-dropbox-design.md`.

---

## File Structure

**New — business logic (unit-tested):**
- `lib/dropbox/token.ts` — public token generation
- `lib/dropbox/validation.ts` — file/MIME validation, `MediaKind` resolution, zod input schemas
- `lib/dropbox/passphrase.ts` — bcrypt hash/verify wrappers
- `lib/dropbox/turnstile.ts` — Cloudflare siteverify (mockable)
- `lib/dropbox/rate-limit.ts` — IP hashing + Redis sliding-window limiter
- `lib/dropbox/cap.ts` — atomic `acceptedCount` reservation
- `lib/dropbox/promote.ts` — promote/reject a `DropboxFile`

**New — API routes:**
- `app/api/dropbox/[token]/presign/route.ts` (public)
- `app/api/dropbox/[token]/confirm/route.ts` (public)
- `app/api/admin/dropboxes/route.ts` (GET list, POST create)
- `app/api/admin/dropboxes/[id]/route.ts` (PATCH, DELETE)
- `app/api/admin/dropboxes/[id]/submissions/route.ts` (GET)
- `app/api/admin/dropboxes/[id]/review/route.ts` (POST)

**New — pages/UI:**
- `app/submit/[token]/page.tsx` + `app/submit/[token]/DropboxUploader.tsx`
- `app/admin/dropboxes/page.tsx` + `app/admin/dropboxes/DropboxList.tsx`
- `app/admin/dropboxes/[id]/page.tsx` + `app/admin/dropboxes/[id]/ReviewClient.tsx`

**New — ops:**
- `scripts/cleanup-dropbox-staging.ts`

**Modified:**
- `prisma/schema.prisma` (models + enums + back-relations)
- `lib/s3.ts` (add `copyObject`)
- `components/Admin/AdminSidebar.tsx` (nav entry)
- `.env.example`, `docker-compose.dev.yml` (env vars)
- `package.json` (nanoid, vitest, `test` script)

---

## Task 1: Project setup — deps, vitest, env vars

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/dropbox/__smoke__.test.ts` (temporary)
- Modify: `.env.example`, `docker-compose.dev.yml`

- [ ] **Step 1: Install dependencies**

```bash
npm install nanoid
npm install -D vitest
```

- [ ] **Step 2: Add the test script**

Add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 4: Add a smoke test**

`lib/dropbox/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Add env vars**

Append to `.env.example`:

```env
# Cloudflare Turnstile (anonymous dropbox bot protection)
# Dev/test always-pass keys shown; replace in production.
NEXT_PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"
# Salt for hashing uploader IPs (any long random string)
DROPBOX_IP_HASH_SALT="change-me-to-a-long-random-string"
```

In `docker-compose.dev.yml`, add the same three vars to the `app` service `environment:` list (use the test keys).

- [ ] **Step 7: Delete the smoke test and commit**

```bash
rm lib/dropbox/__smoke__.test.ts
git add package.json package-lock.json vitest.config.ts .env.example docker-compose.dev.yml
git commit -m "chore: add vitest + nanoid + Turnstile env for dropbox feature"
```

---

## Task 2: Prisma schema — staging models

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: models `Dropbox`, `DropboxSubmission`, `DropboxFile`; enums `MediaKind` (`IMAGE`|`VIDEO`), `DropboxFileStatus` (`PENDING`|`APPROVED`|`REJECTED`). Back-relations `Album.dropboxes`, `User.dropboxes`.

- [ ] **Step 1: Add the models + enums**

Append to `prisma/schema.prisma` (exact block from the spec §4):

```prisma
model Dropbox {
  id                    String   @id @default(cuid())
  token                 String   @unique
  name                  String
  destinationAlbumId    String?
  enabled               Boolean  @default(true)
  expiresAt             DateTime?
  passphraseHash        String?
  maxUploads            Int?
  acceptedCount         Int      @default(0)
  maxFilesPerSubmission Int      @default(50)
  maxFileSizeBytes      Int      @default(52428800)
  allowVideos           Boolean  @default(true)
  createdById           String
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  destinationAlbum      Album?              @relation(fields: [destinationAlbumId], references: [id], onDelete: SetNull)
  createdBy             User                @relation(fields: [createdById], references: [id])
  submissions           DropboxSubmission[]
  @@index([token])
  @@map("dropboxes")
}

model DropboxSubmission {
  id            String        @id @default(cuid())
  dropboxId     String
  uploaderName  String?
  uploaderEmail String?
  message       String?       @db.Text
  ipHash        String?
  userAgent     String?
  reviewedAt    DateTime?
  createdAt     DateTime      @default(now())
  dropbox       Dropbox       @relation(fields: [dropboxId], references: [id], onDelete: Cascade)
  files         DropboxFile[]
  @@index([dropboxId, createdAt])
  @@map("dropbox_submissions")
}

model DropboxFile {
  id              String            @id @default(cuid())
  submissionId    String
  filename        String
  s3Key           String
  contentType     String
  fileSize        Int
  kind            MediaKind
  status          DropboxFileStatus @default(PENDING)
  reviewedById    String?
  reviewedAt      DateTime?
  promotedPhotoId String?
  promotedVideoId String?
  rejectionReason String?
  createdAt       DateTime          @default(now())
  submission      DropboxSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  @@index([submissionId])
  @@index([status])
  @@map("dropbox_files")
}

enum MediaKind { IMAGE VIDEO }
enum DropboxFileStatus { PENDING APPROVED REJECTED }
```

- [ ] **Step 2: Add back-relations**

In `model Album { ... }` add: `dropboxes  Dropbox[]`
In `model User { ... }` add: `dropboxes  Dropbox[]`

- [ ] **Step 3: Create the migration and regenerate the client**

Run: `npm run db:migrate -- --name add_dropbox_models` (dev DB must be running — see Task 19 / the dockerized Postgres).
Expected: migration created + applied; `Prisma Client` regenerated with no error.

- [ ] **Step 4: Verify the models exist**

Run:
```bash
node --input-type=module -e "import('@prisma/client').then(async m => { const { PrismaPg } = await import('@prisma/adapter-pg'); const c = new m.PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }); console.log(typeof c.dropbox.findMany, typeof c.dropboxFile.findMany); process.exit(0); })"
```
Expected: `function function`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Dropbox/DropboxSubmission/DropboxFile staging models"
```

---

## Task 3: Public token generation

**Files:**
- Create: `lib/dropbox/token.ts`
- Test: `lib/dropbox/token.test.ts`

**Interfaces:**
- Produces: `generateDropboxToken(): string` — 21-char URL-safe token.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/token.test.ts`
Expected: FAIL (cannot find `./token`).

- [ ] **Step 3: Implement**

`lib/dropbox/token.ts`:

```ts
import { nanoid } from 'nanoid';

/** Unguessable, URL-safe public dropbox token. */
export function generateDropboxToken(): string {
  return nanoid(21);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/token.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/token.ts lib/dropbox/token.test.ts
git commit -m "feat(dropbox): public token generator"
```

---

## Task 4: File validation + MediaKind + input schemas

**Files:**
- Create: `lib/dropbox/validation.ts`
- Test: `lib/dropbox/validation.test.ts`

**Interfaces:**
- Consumes: `isImageFile`, `isVideoFile` from `@/lib/utils`.
- Produces:
  - `type DeclaredFile = { filename: string; contentType: string; size: number }`
  - `resolveMediaKind(filename: string): 'IMAGE' | 'VIDEO' | null`
  - `sanitizeFilename(name: string): string`
  - `validateDeclaredFiles(files, opts): { ok: true } | { ok: false; error: string }` where `opts = { maxFiles: number; maxFileSizeBytes: number; allowVideos: boolean }`
  - `submissionMetaSchema` (zod) for `{ uploaderName?, uploaderEmail?, message? }`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/validation.test.ts`
Expected: FAIL (cannot find `./validation`).

- [ ] **Step 3: Implement**

`lib/dropbox/validation.ts`:

```ts
import { z } from 'zod';
import { isImageFile, isVideoFile } from '@/lib/utils';

export type DeclaredFile = { filename: string; contentType: string; size: number };

export function resolveMediaKind(filename: string): 'IMAGE' | 'VIDEO' | null {
  if (isImageFile(filename)) return 'IMAGE';
  if (isVideoFile(filename)) return 'VIDEO';
  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

export function validateDeclaredFiles(
  files: DeclaredFile[],
  opts: { maxFiles: number; maxFileSizeBytes: number; allowVideos: boolean }
): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'No files provided' };
  if (files.length > opts.maxFiles) return { ok: false, error: `Too many files (max ${opts.maxFiles})` };
  for (const f of files) {
    if (!f.filename || typeof f.size !== 'number') return { ok: false, error: 'Invalid file entry' };
    if (f.size <= 0 || f.size > opts.maxFileSizeBytes) return { ok: false, error: `File too large: ${f.filename}` };
    const kind = resolveMediaKind(f.filename);
    if (!kind) return { ok: false, error: `Unsupported file type: ${f.filename}` };
    if (kind === 'VIDEO' && !opts.allowVideos) return { ok: false, error: `Videos are not accepted: ${f.filename}` };
  }
  return { ok: true };
}

export const submissionMetaSchema = z.object({
  uploaderName: z.string().trim().max(200).optional(),
  uploaderEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional(),
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/validation.ts lib/dropbox/validation.test.ts
git commit -m "feat(dropbox): file validation + media kind + input schema"
```

---

## Task 5: Passphrase hashing

**Files:**
- Create: `lib/dropbox/passphrase.ts`
- Test: `lib/dropbox/passphrase.test.ts`

**Interfaces:**
- Produces: `hashPassphrase(pw: string): Promise<string>`, `verifyPassphrase(pw: string | null, hash: string | null): Promise<boolean>` (returns `true` when `hash` is null → no passphrase set).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { hashPassphrase, verifyPassphrase } from './passphrase';

describe('passphrase', () => {
  it('verifies a correct passphrase', async () => {
    const h = await hashPassphrase('hunter2');
    expect(await verifyPassphrase('hunter2', h)).toBe(true);
    expect(await verifyPassphrase('wrong', h)).toBe(false);
  });
  it('treats a null hash as open (no passphrase set)', async () => {
    expect(await verifyPassphrase(null, null)).toBe(true);
    expect(await verifyPassphrase('anything', null)).toBe(true);
  });
  it('rejects a missing passphrase when one is required', async () => {
    const h = await hashPassphrase('secret');
    expect(await verifyPassphrase(null, h)).toBe(false);
    expect(await verifyPassphrase('', h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/passphrase.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/dropbox/passphrase.ts`:

```ts
import bcrypt from 'bcryptjs';

export async function hashPassphrase(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassphrase(pw: string | null, hash: string | null): Promise<boolean> {
  if (!hash) return true; // no passphrase configured on this dropbox
  if (!pw) return false;
  return bcrypt.compare(pw, hash);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/passphrase.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/passphrase.ts lib/dropbox/passphrase.test.ts
git commit -m "feat(dropbox): passphrase hash/verify"
```

---

## Task 6: Turnstile verification

**Files:**
- Create: `lib/dropbox/turnstile.ts`
- Test: `lib/dropbox/turnstile.test.ts`

**Interfaces:**
- Produces: `verifyTurnstile(token: string | null, remoteIp?: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test** (mock `fetch`)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/turnstile.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/dropbox/turnstile.ts`:

```ts
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string | null, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed in production; allow only if a dev explicitly leaves it unset in non-prod.
    return process.env.NODE_ENV !== 'production';
  }
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/turnstile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/turnstile.ts lib/dropbox/turnstile.test.ts
git commit -m "feat(dropbox): Cloudflare Turnstile verification"
```

---

## Task 7: IP hashing + rate limiter

**Files:**
- Create: `lib/dropbox/rate-limit.ts`
- Test: `lib/dropbox/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `hashIp(ip: string): string` — salted sha256 hex.
  - `getClientIp(req: Request): string` — from `x-forwarded-for` / `x-real-ip`, else `'unknown'`.
  - `checkRateLimit(key: string, opts?: { limit?: number; windowSeconds?: number }): Promise<boolean>` — `true` if allowed. Uses ioredis `INCR`+`EXPIRE`.

- [ ] **Step 1: Write the failing test** (only the pure helpers are unit-tested; the Redis path is covered in Task 19 manual verification)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/rate-limit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/dropbox/rate-limit.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/rate-limit.ts lib/dropbox/rate-limit.test.ts
git commit -m "feat(dropbox): ip hashing + redis rate limiter"
```

---

## Task 8: S3 `copyObject` + atomic cap reservation

**Files:**
- Modify: `lib/s3.ts`
- Create: `lib/dropbox/cap.ts`

**Interfaces:**
- Produces:
  - `S3Service.copyObject(srcKey: string, destKey: string): Promise<void>`
  - `tryReserveCap(dropboxId: string, n: number): Promise<boolean>` — atomic; `true` if the `n` slots were reserved (respecting `maxUploads`).

- [ ] **Step 1: Add `copyObject` to `lib/s3.ts`**

Add `CopyObjectCommand` to the import from `@aws-sdk/client-s3`, then add this method to `S3Service` (next to `deleteObject`):

```ts
  async copyObject(srcKey: string, destKey: string): Promise<void> {
    this.initializeBucket();
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${encodeURIComponent(srcKey)}`,
      Key: destKey,
    });
    await getS3Client().send(command);
  }
```

- [ ] **Step 2: Implement `lib/dropbox/cap.ts`**

```ts
import { prisma } from '@/lib/prisma';

/**
 * Atomically reserve `n` upload slots on a dropbox, honoring maxUploads.
 * Returns true if reserved. Safe under concurrent confirms (single UPDATE).
 */
export async function tryReserveCap(dropboxId: string, n: number): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "dropboxes"
    SET "acceptedCount" = "acceptedCount" + ${n}
    WHERE "id" = ${dropboxId}
      AND ("maxUploads" IS NULL OR "acceptedCount" + ${n} <= "maxUploads")
  `;
  return updated === 1;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual atomic check** (dockerized DB running — Task 19)

Create a dropbox with `maxUploads=2`, then run `tryReserveCap(id, 1)` three times via a scratch `tsx` script; expect `true, true, false`. (Covered again in Task 19.)

- [ ] **Step 5: Commit**

```bash
git add lib/s3.ts lib/dropbox/cap.ts
git commit -m "feat(dropbox): s3 copyObject + atomic cap reservation"
```

---

## Task 9: Promote / reject a DropboxFile

**Files:**
- Create: `lib/dropbox/promote.ts`
- Test: `lib/dropbox/promote.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getS3Service`, queue enqueue fns, `generateKey`.
- Produces:
  - `promoteDropboxFile(fileId: string, albumId: string, reviewerId: string): Promise<{ photoId?: string; videoId?: string }>`
  - `rejectDropboxFile(fileId: string, reviewerId: string, reason?: string): Promise<void>`
  - `markSubmissionReviewedIfComplete(submissionId: string): Promise<void>`

- [ ] **Step 1: Write the failing test** (mock prisma, s3, queues — assert the IMAGE vs VIDEO branch)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPhoto = { create: vi.fn(async () => ({ id: 'photo1' })) };
const mockVideo = { create: vi.fn(async () => ({ id: 'video1' })) };
const mockDropboxFile = {
  findUnique: vi.fn(),
  update: vi.fn(async () => ({})),
};
const mockAlbum = { findUnique: vi.fn(async () => ({ id: 'alb1', path: 'events/wedding' })) };

vi.mock('@/lib/prisma', () => ({
  prisma: { photo: mockPhoto, video: mockVideo, dropboxFile: mockDropboxFile, album: mockAlbum },
}));
const copyObject = vi.fn(async () => {});
const deleteObject = vi.fn(async () => {});
vi.mock('@/lib/s3', () => ({
  getS3Service: () => ({ copyObject, deleteObject, generateKey: (p: string, f: string) => `photos/${p}/${f}` }),
}));
const enqueueThumbnailJob = vi.fn(async () => {});
const enqueueBlurhashJob = vi.fn(async () => {});
const enqueueExifJob = vi.fn(async () => {});
const enqueueVideoThumbnailJob = vi.fn(async () => {});
vi.mock('@/lib/queues/thumbnailQueue', () => ({ enqueueThumbnailJob }));
vi.mock('@/lib/queues/blurhashQueue', () => ({ enqueueBlurhashJob }));
vi.mock('@/lib/queues/exifQueue', () => ({ enqueueExifJob }));
vi.mock('@/lib/queues/videoThumbnailQueue', () => ({ enqueueVideoThumbnailJob }));

import { promoteDropboxFile } from './promote';

beforeEach(() => vi.clearAllMocks());

describe('promoteDropboxFile', () => {
  it('promotes an IMAGE to a Photo and enqueues photo jobs', async () => {
    mockDropboxFile.findUnique.mockResolvedValue({ id: 'f1', kind: 'IMAGE', filename: 'a.jpg', s3Key: '_dropbox/d/s/u_a.jpg', fileSize: 10 });
    const res = await promoteDropboxFile('f1', 'alb1', 'admin1');
    expect(res.photoId).toBe('photo1');
    expect(mockPhoto.create).toHaveBeenCalled();
    expect(enqueueThumbnailJob).toHaveBeenCalled();
    expect(enqueueBlurhashJob).toHaveBeenCalled();
    expect(enqueueExifJob).toHaveBeenCalled();
    expect(enqueueVideoThumbnailJob).not.toHaveBeenCalled();
    expect(copyObject).toHaveBeenCalledWith('_dropbox/d/s/u_a.jpg', 'photos/events/wedding/a.jpg');
    expect(deleteObject).toHaveBeenCalledWith('_dropbox/d/s/u_a.jpg');
  });

  it('promotes a VIDEO to a Video and enqueues the video-thumbnail job', async () => {
    mockDropboxFile.findUnique.mockResolvedValue({ id: 'f2', kind: 'VIDEO', filename: 'a.mov', s3Key: '_dropbox/d/s/u_a.mov', fileSize: 10 });
    const res = await promoteDropboxFile('f2', 'alb1', 'admin1');
    expect(res.videoId).toBe('video1');
    expect(mockVideo.create).toHaveBeenCalled();
    expect(enqueueVideoThumbnailJob).toHaveBeenCalled();
    expect(enqueueThumbnailJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/dropbox/promote.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/dropbox/promote.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { enqueueThumbnailJob } from '@/lib/queues/thumbnailQueue';
import { enqueueBlurhashJob } from '@/lib/queues/blurhashQueue';
import { enqueueExifJob } from '@/lib/queues/exifQueue';
import { enqueueVideoThumbnailJob } from '@/lib/queues/videoThumbnailQueue';

export async function promoteDropboxFile(
  fileId: string,
  albumId: string,
  reviewerId: string
): Promise<{ photoId?: string; videoId?: string }> {
  const file = await prisma.dropboxFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('Dropbox file not found');
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album) throw new Error('Destination album not found');

  const s3 = getS3Service();
  // Move staging object into the album's key namespace (dedupe on collision).
  let destKey = s3.generateKey(album.path, file.filename);
  if (await s3.objectExists(destKey)) {
    const dot = file.filename.lastIndexOf('.');
    const stem = dot === -1 ? file.filename : file.filename.slice(0, dot);
    const ext = dot === -1 ? '' : file.filename.slice(dot);
    destKey = s3.generateKey(album.path, `${stem}_${file.id.slice(0, 6)}${ext}`);
  }
  await s3.copyObject(file.s3Key, destKey);
  await s3.deleteObject(file.s3Key);

  if (file.kind === 'IMAGE') {
    const photo = await prisma.photo.create({
      data: { albumId, filename: file.filename, s3Key: destKey, fileSize: file.fileSize },
    });
    await enqueueThumbnailJob({ photoId: photo.id, s3Key: destKey, albumPath: album.path, filename: file.filename });
    await enqueueBlurhashJob({ photoId: photo.id, s3Key: destKey });
    await enqueueExifJob({ photoId: photo.id });
    await prisma.dropboxFile.update({
      where: { id: fileId },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), promotedPhotoId: photo.id },
    });
    return { photoId: photo.id };
  }

  const video = await prisma.video.create({
    data: { albumId, filename: file.filename, originalPath: destKey, s3Key: destKey, fileSize: file.fileSize },
  });
  await enqueueVideoThumbnailJob({ videoId: video.id, s3Key: destKey, albumPath: album.path, filename: file.filename });
  await prisma.dropboxFile.update({
    where: { id: fileId },
    data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), promotedVideoId: video.id },
  });
  return { videoId: video.id };
}

export async function rejectDropboxFile(fileId: string, reviewerId: string, reason?: string): Promise<void> {
  const file = await prisma.dropboxFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error('Dropbox file not found');
  await getS3Service().deleteObject(file.s3Key).catch(() => {});
  await prisma.dropboxFile.update({
    where: { id: fileId },
    data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: reason ?? null },
  });
}

export async function markSubmissionReviewedIfComplete(submissionId: string): Promise<void> {
  const pending = await prisma.dropboxFile.count({ where: { submissionId, status: 'PENDING' } });
  if (pending === 0) {
    await prisma.dropboxSubmission.update({ where: { id: submissionId }, data: { reviewedAt: new Date() } });
  }
}
```

*(Note: `Video.originalPath` is required in the schema; we set it to the S3 key since dropbox videos have no filesystem origin.)*

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/dropbox/promote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dropbox/promote.ts lib/dropbox/promote.test.ts
git commit -m "feat(dropbox): promote/reject a staged file into Photo/Video"
```

---

## Task 10: Admin API — create & list dropboxes

**Files:**
- Create: `app/api/admin/dropboxes/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `generateDropboxToken`, `hashPassphrase`.
- Produces: `GET` (list w/ counts), `POST` (create → `{ id, token, url }`).

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { generateDropboxToken } from '@/lib/dropbox/token';
import { hashPassphrase } from '@/lib/dropbox/passphrase';

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const dropboxes = await prisma.dropbox.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      destinationAlbum: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });

  const withPending = await Promise.all(
    dropboxes.map(async (d) => ({
      ...d,
      passphraseHash: undefined,
      hasPassphrase: !!d.passphraseHash,
      pendingCount: await prisma.dropboxFile.count({
        where: { submission: { dropboxId: d.id }, status: 'PENDING' },
      }),
    }))
  );

  return NextResponse.json({ dropboxes: withPending });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  const {
    name, destinationAlbumId, expiresAt, passphrase,
    maxUploads, maxFilesPerSubmission, maxFileSizeBytes, allowVideos,
  } = body ?? {};

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const dropbox = await prisma.dropbox.create({
    data: {
      name,
      token: generateDropboxToken(),
      destinationAlbumId: destinationAlbumId || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      passphraseHash: passphrase ? await hashPassphrase(passphrase) : null,
      maxUploads: maxUploads ?? null,
      maxFilesPerSubmission: maxFilesPerSubmission ?? 50,
      maxFileSizeBytes: maxFileSizeBytes ?? 52428800,
      allowVideos: allowVideos ?? true,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({
    id: dropbox.id,
    token: dropbox.token,
    url: `/submit/${dropbox.token}`,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. *(If `session.user.id` is untyped, confirm the NextAuth session type includes `id`; it is used elsewhere e.g. `app/api/admin/users/route.ts`.)*

- [ ] **Step 3: Manual verify** (dev server + a logged-in admin cookie — Task 19 covers full flow)

Run (after login, with the session cookie in `$COOKIE`):
```bash
curl -s -X POST http://localhost:3010/api/admin/dropboxes -H "Content-Type: application/json" -H "Cookie: $COOKIE" -d '{"name":"Test Drop","maxUploads":5}'
```
Expected: JSON `{ "id": "...", "token": "...", "url": "/submit/..." }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/dropboxes/route.ts
git commit -m "feat(dropbox): admin create/list dropboxes API"
```

---

## Task 11: Admin API — update, rotate token, delete

**Files:**
- Create: `app/api/admin/dropboxes/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `generateDropboxToken`, `hashPassphrase`, `getS3Service`.
- Produces: `PATCH` (edit/enable/disable/set-destination/rotateToken/set-passphrase), `DELETE` (cascade + purge staging).

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { generateDropboxToken } from '@/lib/dropbox/token';
import { hashPassphrase } from '@/lib/dropbox/passphrase';
import { getS3Service } from '@/lib/s3';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name;
  if ('destinationAlbumId' in body) data.destinationAlbumId = body.destinationAlbumId || null;
  if ('enabled' in body) data.enabled = !!body.enabled;
  if ('expiresAt' in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if ('maxUploads' in body) data.maxUploads = body.maxUploads ?? null;
  if ('maxFilesPerSubmission' in body) data.maxFilesPerSubmission = body.maxFilesPerSubmission;
  if ('maxFileSizeBytes' in body) data.maxFileSizeBytes = body.maxFileSizeBytes;
  if ('allowVideos' in body) data.allowVideos = !!body.allowVideos;
  if (body.rotateToken === true) data.token = generateDropboxToken();
  if ('passphrase' in body) data.passphraseHash = body.passphrase ? await hashPassphrase(body.passphrase) : null;

  const updated = await prisma.dropbox.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id, token: updated.token, url: `/submit/${updated.token}` });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  // Purge staged S3 objects for all still-pending files before cascade delete.
  const files = await prisma.dropboxFile.findMany({
    where: { submission: { dropboxId: id }, status: 'PENDING' },
    select: { s3Key: true },
  });
  const s3 = getS3Service();
  await Promise.all(files.map((f) => s3.deleteObject(f.s3Key).catch(() => {})));

  await prisma.dropbox.delete({ where: { id } }); // cascades submissions + files
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/dropboxes/[id]/route.ts"
git commit -m "feat(dropbox): admin update/rotate/delete dropbox API"
```

---

## Task 12: Public API — presign

**Files:**
- Create: `app/api/dropbox/[token]/presign/route.ts`

**Interfaces:**
- Consumes: `prisma`, `verifyTurnstile`, `verifyPassphrase`, `checkRateLimit`, `hashIp`, `getClientIp`, `validateDeclaredFiles`, `resolveMediaKind`, `sanitizeFilename`, `getS3Service`.
- Produces: `POST` → `{ submissionId, uploads: [{ filename, s3Key, presignedUrl }] }`.
- Request body: `{ turnstileToken, passphrase?, meta?: {uploaderName?,uploaderEmail?,message?}, files: DeclaredFile[] }`.

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTurnstile } from '@/lib/dropbox/turnstile';
import { verifyPassphrase } from '@/lib/dropbox/passphrase';
import { checkRateLimit, hashIp, getClientIp } from '@/lib/dropbox/rate-limit';
import { validateDeclaredFiles, resolveMediaKind, sanitizeFilename, submissionMetaSchema, type DeclaredFile } from '@/lib/dropbox/validation';
import { getS3Service } from '@/lib/s3';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { token } });
  if (!dropbox || !dropbox.enabled) return NextResponse.json({ error: 'This dropbox is not available' }, { status: 404 });
  if (dropbox.expiresAt && dropbox.expiresAt < new Date()) return NextResponse.json({ error: 'This dropbox has expired' }, { status: 410 });
  if (dropbox.maxUploads !== null && dropbox.acceptedCount >= dropbox.maxUploads) return NextResponse.json({ error: 'This dropbox is full' }, { status: 409 });

  const body = await request.json();
  const ip = getClientIp(request);

  if (!(await verifyTurnstile(body?.turnstileToken ?? null, ip))) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }
  if (!(await verifyPassphrase(body?.passphrase ?? null, dropbox.passphraseHash))) {
    return NextResponse.json({ error: 'Incorrect passphrase' }, { status: 403 });
  }
  if (!(await checkRateLimit(`${dropbox.id}:${hashIp(ip)}`))) {
    return NextResponse.json({ error: 'Too many uploads, please try again later' }, { status: 429 });
  }

  const meta = submissionMetaSchema.safeParse(body?.meta ?? {});
  if (!meta.success) return NextResponse.json({ error: 'Invalid submission details' }, { status: 400 });

  const files = (body?.files ?? []) as DeclaredFile[];
  const validation = validateDeclaredFiles(files, {
    maxFiles: dropbox.maxFilesPerSubmission,
    maxFileSizeBytes: dropbox.maxFileSizeBytes,
    allowVideos: dropbox.allowVideos,
  });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const submission = await prisma.dropboxSubmission.create({
    data: {
      dropboxId: dropbox.id,
      uploaderName: meta.data.uploaderName || null,
      uploaderEmail: meta.data.uploaderEmail || null,
      message: meta.data.message || null,
      ipHash: hashIp(ip),
      userAgent: request.headers.get('user-agent')?.slice(0, 500) || null,
    },
  });

  const s3 = getS3Service();
  const uploads = await Promise.all(
    files.map(async (f) => {
      const safe = sanitizeFilename(f.filename);
      const kind = resolveMediaKind(f.filename)!; // validated above
      const s3Key = `_dropbox/${dropbox.id}/${submission.id}/${crypto.randomUUID()}_${safe}`;
      const presignedUrl = await s3.getPresignedUploadUrl(s3Key, f.contentType, 900);
      await prisma.dropboxFile.create({
        data: { submissionId: submission.id, filename: safe, s3Key, contentType: f.contentType, fileSize: f.size, kind },
      });
      return { filename: safe, s3Key, presignedUrl };
    })
  );

  return NextResponse.json({ submissionId: submission.id, uploads });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/dropbox/[token]/presign/route.ts"
git commit -m "feat(dropbox): public presign endpoint (turnstile+passphrase+ratelimit+caps)"
```

---

## Task 13: Public API — confirm

**Files:**
- Create: `app/api/dropbox/[token]/confirm/route.ts`

**Interfaces:**
- Consumes: `prisma`, `getS3Service`, `tryReserveCap`.
- Produces: `POST` → `{ accepted: number, rejected: string[] }`.
- Request body: `{ submissionId: string }`.

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';
import { tryReserveCap } from '@/lib/dropbox/cap';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { token } });
  if (!dropbox) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { submissionId } = await request.json();
  const files = await prisma.dropboxFile.findMany({
    where: { submissionId, submission: { dropboxId: dropbox.id }, status: 'PENDING' },
  });

  const s3 = getS3Service();
  const rejected: string[] = [];
  const validFileIds: string[] = [];

  for (const file of files) {
    try {
      const meta = await s3.getObjectMetadata(file.s3Key);
      const sizeOk = meta.size > 0 && meta.size <= dropbox.maxFileSizeBytes;
      if (!sizeOk) {
        await s3.deleteObject(file.s3Key).catch(() => {});
        await prisma.dropboxFile.delete({ where: { id: file.id } });
        rejected.push(file.filename);
        continue;
      }
      validFileIds.push(file.id);
    } catch {
      // object never actually uploaded — drop the row
      await prisma.dropboxFile.delete({ where: { id: file.id } });
      rejected.push(file.filename);
    }
  }

  // Reserve cap for the accepted files (atomic); if the drop filled up, clean overflow.
  if (validFileIds.length > 0) {
    const reserved = await tryReserveCap(dropbox.id, validFileIds.length);
    if (!reserved) {
      const overflow = await prisma.dropboxFile.findMany({ where: { id: { in: validFileIds } } });
      await Promise.all(overflow.map((f) => s3.deleteObject(f.s3Key).catch(() => {})));
      await prisma.dropboxFile.deleteMany({ where: { id: { in: validFileIds } } });
      return NextResponse.json({ error: 'This dropbox filled up before your upload completed' }, { status: 409 });
    }
  }

  return NextResponse.json({ accepted: validFileIds.length, rejected });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/dropbox/[token]/confirm/route.ts"
git commit -m "feat(dropbox): public confirm endpoint (real size check + atomic cap)"
```

---

## Task 14: Admin API — submissions list & review

**Files:**
- Create: `app/api/admin/dropboxes/[id]/submissions/route.ts`
- Create: `app/api/admin/dropboxes/[id]/review/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `prisma`, `getS3Service`, `promoteDropboxFile`, `rejectDropboxFile`, `markSubmissionReviewedIfComplete`.
- Produces:
  - `GET submissions` → `{ submissions: [{ ...meta, files: [{ id, filename, kind, status, previewUrl }] }] }`.
  - `POST review` body `{ action: 'approve'|'reject', fileIds: string[], destinationAlbumId?: string, reason?: string }` → `{ processed, errors }`.

- [ ] **Step 1: Implement `submissions/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { getS3Service } from '@/lib/s3';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const submissions = await prisma.dropboxSubmission.findMany({
    where: { dropboxId: id },
    orderBy: { createdAt: 'desc' },
    include: { files: { orderBy: { createdAt: 'asc' } } },
  });

  const s3 = getS3Service();
  const withPreviews = await Promise.all(
    submissions.map(async (sub) => ({
      id: sub.id,
      uploaderName: sub.uploaderName,
      uploaderEmail: sub.uploaderEmail,
      message: sub.message,
      createdAt: sub.createdAt,
      reviewedAt: sub.reviewedAt,
      files: await Promise.all(
        sub.files.map(async (f) => ({
          id: f.id,
          filename: f.filename,
          kind: f.kind,
          status: f.status,
          previewUrl: f.status === 'PENDING' ? await s3.getSignedUrl(f.s3Key, 600) : null,
        }))
      ),
    }))
  );

  return NextResponse.json({ submissions: withPreviews });
}
```

- [ ] **Step 2: Implement `review/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { promoteDropboxFile, rejectDropboxFile, markSubmissionReviewedIfComplete } from '@/lib/dropbox/promote';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const { action, fileIds, destinationAlbumId, reason } = await request.json();

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json({ error: 'fileIds required' }, { status: 400 });
  }

  let albumId: string | null = destinationAlbumId ?? null;
  if (action === 'approve' && !albumId) {
    const dropbox = await prisma.dropbox.findUnique({ where: { id } });
    albumId = dropbox?.destinationAlbumId ?? null;
    if (!albumId) return NextResponse.json({ error: 'No destination album set — pick one to approve' }, { status: 400 });
  }

  const errors: Array<{ fileId: string; error: string }> = [];
  const submissionIds = new Set<string>();

  for (const fileId of fileIds as string[]) {
    const file = await prisma.dropboxFile.findFirst({
      where: { id: fileId, submission: { dropboxId: id }, status: 'PENDING' },
      select: { id: true, submissionId: true },
    });
    if (!file) { errors.push({ fileId, error: 'Not found or already reviewed' }); continue; }
    try {
      if (action === 'approve') await promoteDropboxFile(fileId, albumId!, session.user.id);
      else await rejectDropboxFile(fileId, session.user.id, reason);
      submissionIds.add(file.submissionId);
    } catch (e) {
      errors.push({ fileId, error: e instanceof Error ? e.message : 'Failed' });
    }
  }

  for (const sid of submissionIds) await markSubmissionReviewedIfComplete(sid);
  return NextResponse.json({ processed: fileIds.length - errors.length, errors });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/dropboxes/[id]/submissions/route.ts" "app/api/admin/dropboxes/[id]/review/route.ts"
git commit -m "feat(dropbox): admin submissions list + review/approve API"
```

---

## Task 15: Public upload page + uploader client

**Files:**
- Create: `app/submit/[token]/page.tsx`
- Create: `app/submit/[token]/DropboxUploader.tsx`

**Interfaces:**
- Consumes: `prisma` (page), the public presign/confirm endpoints (client), the Turnstile widget.

- [ ] **Step 1: Implement the server page (`page.tsx`)**

```tsx
import { prisma } from '@/lib/prisma';
import { DropboxUploader } from './DropboxUploader';

export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { token } });

  let state: 'open' | 'notfound' | 'expired' | 'full' = 'open';
  if (!dropbox || !dropbox.enabled) state = 'notfound';
  else if (dropbox.expiresAt && dropbox.expiresAt < new Date()) state = 'expired';
  else if (dropbox.maxUploads !== null && dropbox.acceptedCount >= dropbox.maxUploads) state = 'full';

  if (state !== 'open' || !dropbox) {
    const msg = state === 'expired' ? 'This upload link has expired.'
      : state === 'full' ? 'This upload link is no longer accepting files.'
      : 'This upload link was not found.';
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Unavailable</h1>
        <p className="text-muted-foreground">{msg}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{dropbox.name}</h1>
        <p className="text-muted-foreground">Upload your photos{dropbox.allowVideos ? ' and videos' : ''} below.</p>
      </div>
      <DropboxUploader
        token={token}
        requiresPassphrase={!!dropbox.passphraseHash}
        allowVideos={dropbox.allowVideos}
        maxFiles={dropbox.maxFilesPerSubmission}
        maxFileSizeBytes={dropbox.maxFileSizeBytes}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
      />
    </main>
  );
}
```

- [ ] **Step 2: Implement the client uploader (`DropboxUploader.tsx`)**

```tsx
'use client';
import { useRef, useState } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  token: string; requiresPassphrase: boolean; allowVideos: boolean;
  maxFiles: number; maxFileSizeBytes: number; turnstileSiteKey: string;
};

declare global { interface Window { turnstile?: { getResponse: (id?: string) => string } } }

export function DropboxUploader(props: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);

  const accept = props.allowVideos ? 'image/*,video/*' : 'image/*';

  async function onSubmit() {
    setError(''); setStatus('uploading');
    try {
      const turnstileToken = window.turnstile?.getResponse();
      if (props.turnstileSiteKey && !turnstileToken) throw new Error('Please complete the verification challenge');

      const presignRes = await fetch(`/api/dropbox/${props.token}/presign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstileToken, passphrase: props.requiresPassphrase ? passphrase : undefined,
          meta: { uploaderName: name, uploaderEmail: email, message },
          files: files.map((f) => ({ filename: f.name, contentType: f.type || 'application/octet-stream', size: f.size })),
        }),
      });
      if (!presignRes.ok) throw new Error((await presignRes.json()).error || 'Upload failed');
      const { submissionId, uploads } = await presignRes.json();

      await Promise.all(uploads.map((u: { presignedUrl: string }, i: number) =>
        fetch(u.presignedUrl, { method: 'PUT', body: files[i], headers: { 'Content-Type': files[i].type || 'application/octet-stream' } })
      ));

      const confirmRes = await fetch(`/api/dropbox/${props.token}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId }),
      });
      if (!confirmRes.ok) throw new Error((await confirmRes.json()).error || 'Could not finalize upload');
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed'); setStatus('error');
    }
  }

  if (status === 'done') {
    return <div className="rounded-lg border p-6 text-center"><h2 className="text-lg font-medium">Thank you!</h2><p className="text-muted-foreground">Your upload was received and is awaiting review.</p></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {props.turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <Input type="file" multiple accept={accept} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {props.requiresPassphrase && <Input type="password" placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
      <Input placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <Input type="email" placeholder="Your email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      {props.turnstileSiteKey && <div ref={widgetRef} className="cf-turnstile" data-sitekey={props.turnstileSiteKey} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={status === 'uploading' || files.length === 0} onClick={onSubmit}>
        {status === 'uploading' ? 'Uploading…' : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; `/submit/[token]` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add "app/submit/[token]/page.tsx" "app/submit/[token]/DropboxUploader.tsx"
git commit -m "feat(dropbox): public upload page + uploader client"
```

---

## Task 16: Admin dropboxes list + create dialog

**Files:**
- Create: `app/admin/dropboxes/page.tsx`
- Create: `app/admin/dropboxes/DropboxList.tsx`
- Modify: `components/Admin/AdminSidebar.tsx`

**Interfaces:**
- Consumes: admin dropboxes API (Task 10/11); shadcn `Button`, `Dialog`, `Input`, `Table` (or a simple list).

- [ ] **Step 1: Server page (`page.tsx`)**

```tsx
import { prisma } from '@/lib/prisma';
import { DropboxList } from './DropboxList';

export default async function AdminDropboxesPage() {
  const albums = await prisma.album.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return <DropboxList albums={albums} />;
}
```

- [ ] **Step 2: Client list + create dialog (`DropboxList.tsx`)**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Album = { id: string; name: string };
type Dropbox = { id: string; name: string; token: string; enabled: boolean; pendingCount: number; acceptedCount: number; maxUploads: number | null; hasPassphrase: boolean; destinationAlbum: { name: string } | null };

export function DropboxList({ albums }: { albums: Album[] }) {
  const [dropboxes, setDropboxes] = useState<Dropbox[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', destinationAlbumId: '', maxUploads: '', passphrase: '', allowVideos: true });

  async function load() {
    const res = await fetch('/api/admin/dropboxes');
    if (res.ok) setDropboxes((await res.json()).dropboxes);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await fetch('/api/admin/dropboxes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        destinationAlbumId: form.destinationAlbumId || null,
        maxUploads: form.maxUploads ? Number(form.maxUploads) : null,
        passphrase: form.passphrase || undefined,
        allowVideos: form.allowVideos,
      }),
    });
    setOpen(false); setForm({ name: '', destinationAlbumId: '', maxUploads: '', passphrase: '', allowVideos: true }); load();
  }

  async function toggle(d: Dropbox) {
    await fetch(`/api/admin/dropboxes/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !d.enabled }) });
    load();
  }
  async function remove(d: Dropbox) {
    if (!confirm(`Delete "${d.name}" and all its pending uploads?`)) return;
    await fetch(`/api/admin/dropboxes/${d.id}`, { method: 'DELETE' }); load();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dropboxes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Create dropbox</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New dropbox</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className="rounded-md border p-2" value={form.destinationAlbumId} onChange={(e) => setForm({ ...form, destinationAlbumId: e.target.value })}>
                <option value="">Choose destination later</option>
                {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Input type="number" placeholder="Max total uploads (optional)" value={form.maxUploads} onChange={(e) => setForm({ ...form, maxUploads: e.target.value })} />
              <Input type="password" placeholder="Passphrase (optional)" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowVideos} onChange={(e) => setForm({ ...form, allowVideos: e.target.checked })} /> Allow videos</label>
              <Button disabled={!form.name} onClick={create}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {dropboxes.length === 0 && <p className="p-4 text-muted-foreground">No dropboxes yet.</p>}
        {dropboxes.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <a href={`/admin/dropboxes/${d.id}`} className="font-medium hover:underline">{d.name}</a>
              <p className="truncate text-xs text-muted-foreground">
                {d.destinationAlbum?.name ?? 'no destination'} · {d.acceptedCount}{d.maxUploads ? `/${d.maxUploads}` : ''} accepted
                {d.pendingCount > 0 && ` · ${d.pendingCount} pending`}{d.hasPassphrase && ' · 🔒'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${location.origin}/submit/${d.token}`)}>Copy link</Button>
              <Button variant="outline" size="sm" onClick={() => toggle(d)}>{d.enabled ? 'Disable' : 'Enable'}</Button>
              <Button variant="destructive" size="sm" onClick={() => remove(d)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar nav entry**

In `components/Admin/AdminSidebar.tsx`: import an icon (e.g. `Inbox`) from `lucide-react`, and add an entry to the `allNavigationItems` array: `{ key: "dropboxes", href: "/admin/dropboxes", icon: Inbox, adminOnly: true }`. Add the `"dropboxes"` label to the admin messages file(s) under the same namespace the other nav keys use (e.g. `messages/en.json`); other locales fall back to the key.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; `/admin/dropboxes` in the route list.

- [ ] **Step 5: Commit**

```bash
git add app/admin/dropboxes/page.tsx app/admin/dropboxes/DropboxList.tsx components/Admin/AdminSidebar.tsx messages
git commit -m "feat(dropbox): admin dropboxes list + create dialog + nav"
```

---

## Task 17: Admin review page

**Files:**
- Create: `app/admin/dropboxes/[id]/page.tsx`
- Create: `app/admin/dropboxes/[id]/ReviewClient.tsx`

- [ ] **Step 1: Server page (`page.tsx`)**

```tsx
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { ReviewClient } from './ReviewClient';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { id }, include: { destinationAlbum: { select: { id: true, name: true } } } });
  if (!dropbox) notFound();
  const albums = await prisma.album.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return <ReviewClient dropboxId={id} dropboxName={dropbox.name} destinationAlbumId={dropbox.destinationAlbumId} albums={albums} />;
}
```

- [ ] **Step 2: Client review UI (`ReviewClient.tsx`)**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type File = { id: string; filename: string; kind: 'IMAGE' | 'VIDEO'; status: string; previewUrl: string | null };
type Submission = { id: string; uploaderName: string | null; uploaderEmail: string | null; message: string | null; createdAt: string; files: File[] };
type Album = { id: string; name: string };

export function ReviewClient({ dropboxId, dropboxName, destinationAlbumId, albums }: { dropboxId: string; dropboxName: string; destinationAlbumId: string | null; albums: Album[] }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [albumId, setAlbumId] = useState(destinationAlbumId ?? '');

  async function load() {
    const res = await fetch(`/api/admin/dropboxes/${dropboxId}/submissions`);
    if (res.ok) setSubmissions((await res.json()).submissions);
  }
  useEffect(() => { load(); }, []);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function review(action: 'approve' | 'reject') {
    const fileIds = [...selected];
    if (fileIds.length === 0) return;
    if (action === 'approve' && !albumId) { alert('Pick a destination album first'); return; }
    const res = await fetch(`/api/admin/dropboxes/${dropboxId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, fileIds, destinationAlbumId: albumId || undefined }),
    });
    if (!res.ok) alert((await res.json()).error || 'Failed');
    setSelected(new Set()); load();
  }

  const pending = submissions.flatMap((s) => s.files.filter((f) => f.status === 'PENDING'));

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{dropboxName}</h1>
      <div className="sticky top-0 flex items-center gap-2 bg-background py-2">
        <select className="rounded-md border p-2" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
          <option value="">Destination album…</option>
          {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Button disabled={selected.size === 0} onClick={() => review('approve')}>Approve {selected.size || ''}</Button>
        <Button variant="destructive" disabled={selected.size === 0} onClick={() => review('reject')}>Reject {selected.size || ''}</Button>
        <span className="ml-auto text-sm text-muted-foreground">{pending.length} pending</span>
      </div>

      {submissions.map((sub) => (
        <div key={sub.id} className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">
            {sub.uploaderName || 'Anonymous'} {sub.uploaderEmail ? `· ${sub.uploaderEmail}` : ''} · {new Date(sub.createdAt).toLocaleString()}
            {sub.message && <p className="mt-1 italic">“{sub.message}”</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {sub.files.map((f) => (
              <button key={f.id} onClick={() => f.status === 'PENDING' && toggle(f.id)}
                className={`relative overflow-hidden rounded-md border ${selected.has(f.id) ? 'ring-2 ring-ring' : ''} ${f.status !== 'PENDING' ? 'opacity-40' : ''}`}>
                {f.previewUrl && f.kind === 'IMAGE'
                  ? <img src={f.previewUrl} alt={f.filename} className="aspect-square w-full object-cover" />
                  : <div className="flex aspect-square w-full items-center justify-center text-xs">{f.kind === 'VIDEO' ? '🎬' : '🖼'} {f.filename}</div>}
                {f.status !== 'PENDING' && <span className="absolute right-1 top-1 rounded bg-background/80 px-1 text-[10px]">{f.status}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; `/admin/dropboxes/[id]` in the route list.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/dropboxes/[id]/page.tsx" "app/admin/dropboxes/[id]/ReviewClient.tsx"
git commit -m "feat(dropbox): admin review page with per-file approve/reject"
```

---

## Task 18: Abandoned-staging cleanup script

**Files:**
- Create: `scripts/cleanup-dropbox-staging.ts`
- Modify: `package.json` (script entry)

**Interfaces:**
- Consumes: `createPrismaClient` from `@/lib/prisma-client`, `getS3Service`.

- [ ] **Step 1: Implement the script**

```ts
#!/usr/bin/env tsx
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma-client';
import { getS3Service } from '../lib/s3';

const DAYS = Number(process.env.DROPBOX_STAGING_TTL_DAYS || 7);

async function main() {
  const prisma = createPrismaClient();
  const s3 = getS3Service();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  // Still-pending files older than the cutoff = abandoned uploads.
  const stale = await prisma.dropboxFile.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, s3Key: true },
  });
  console.log(`Found ${stale.length} abandoned staging file(s) older than ${DAYS} days`);
  for (const f of stale) {
    await s3.deleteObject(f.s3Key).catch(() => {});
    await prisma.dropboxFile.delete({ where: { id: f.id } });
  }
  await prisma.$disconnect();
  console.log('Cleanup complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` `"scripts"`: `"dropbox:cleanup": "tsx scripts/cleanup-dropbox-staging.ts"`

- [ ] **Step 3: Verify it runs (dev DB up)**

Run: `npm run dropbox:cleanup`
Expected: `Found 0 abandoned staging file(s)...` then `Cleanup complete`.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup-dropbox-staging.ts package.json
git commit -m "feat(dropbox): abandoned-staging cleanup script"
```

---

## Task 19: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all `lib/dropbox/*.test.ts` PASS.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0; routes `/submit/[token]`, `/admin/dropboxes`, `/admin/dropboxes/[id]`, and the four API routes appear.

- [ ] **Step 3: Bring up the stack** (reuse the Path-B dev stack; ports remapped for local conflicts)

Run: `docker compose -f docker-compose.dev.yml -f /tmp/lumina-ports.yml up -d --build`
Expected: app healthy on `http://localhost:3010`; ensure the migration from Task 2 is applied (`migrate` service or `npm run db:push`).

- [ ] **Step 4: Manual happy path**

1. Log in as admin, seed one if needed: `docker compose -f docker-compose.dev.yml exec app npm run seed:admin`.
2. `/admin/dropboxes` → Create dropbox (pick a destination album, `maxUploads=3`).
3. Copy link → open `/submit/<token>` in an incognito window → upload 1 photo + 1 video (Turnstile test key auto-passes) → see "Thank you!".
4. `/admin/dropboxes/<id>` → confirm the submission + thumbnails appear → select the photo → **Approve**; select the video → **Reject**.
5. Verify: the approved photo now appears in the destination album with generated thumbnails; the rejected video's staging object is gone (`docker compose ... exec app npx tsx -e "..."` or check MinIO/S3); the drop's `acceptedCount` incremented.

- [ ] **Step 5: Manual guard checks**

- Wrong passphrase → `403`. Disabled drop → `/submit` shows Unavailable. Expired drop → Unavailable. Over-cap → confirm returns `409`.
- Oversized file (exceeds `maxFileSizeBytes`) → rejected at confirm; staging object deleted.

- [ ] **Step 6: Final commit (if any verification tweaks were needed)**

```bash
git add -A && git commit -m "test(dropbox): end-to-end verification pass"
```

---

## Self-review notes (coverage vs spec)

- §4 data model → Task 2. §5 public flow → Tasks 12–13, 15. §6 admin flow/promote → Tasks 9–11, 14, 16–17. §7 security (Turnstile/passphrase/rate-limit/caps/hashed IP/isolation/cleanup/env) → Tasks 1, 5–9, 12–13, 18. §8 testing → Tasks 1, 3–9 (vitest) + 19 (manual). All spec sections map to a task.
- Type consistency: `promoteDropboxFile(fileId, albumId, reviewerId)`, `rejectDropboxFile(fileId, reviewerId, reason?)`, `tryReserveCap(dropboxId, n)`, `verifyPassphrase(pw, hash)`, `verifyTurnstile(token, ip?)`, `validateDeclaredFiles(files, opts)`, `hashIp(ip)`/`getClientIp(req)`/`checkRateLimit(key, opts?)` are used consistently across Tasks 9–14.
- Known follow-ups (out of scope, from spec §9): admin email notifications, malware scanning, >2GB files, video EXIF.
