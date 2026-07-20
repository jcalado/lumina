# Anonymous Dropbox — Design Spec

**Date:** 2026-07-20
**Status:** Approved design → ready for implementation planning
**Feature:** A public, link-gated way for unauthenticated users to upload photos and videos that land in a pending/review state for an admin to approve into an album.

---

## 1. Summary

Today lumina has **no** unauthenticated upload path — every upload goes through `/api/admin/albums/[id]/(presign|confirm-upload)`, gated by `requireAlbumAccess(id, 'can_upload')` (an authenticated NextAuth session). The public side (`app/(public)`) is strictly read-only.

This feature adds an **anonymous dropbox**: an admin creates a named "drop" with a shareable link (`/submit/<token>`); anyone with the link can upload photos/videos; uploads land in an isolated staging area; an admin reviews each submission and approves files into a destination album (or rejects them).

**Chosen model:** *per-link intake album* — each dropbox link is its own named drop; uploads land in a holding area; on approval they are promoted into a destination album the admin picks (settable at create time or at review time).

---

## 2. Goals / Non-goals

**Goals**
- Public, unauthenticated upload via an unguessable, rotatable link.
- Photos **and** videos (v1).
- Per-drop admin controls: expiry, total-upload cap, passphrase, per-submission limits (max files, max file size).
- Optional uploader identity (name / email / message).
- Isolated pending state — pending media can never appear in the public gallery.
- Admin review with per-file approve/reject + bulk actions; approval reuses the existing processing pipeline (thumbnail / blurhash / EXIF / video-thumbnail).
- Abuse resistance appropriate to an unauthenticated write path (Cloudflare Turnstile, rate limiting, caps, content validation).

**Non-goals (v1)**
- No uploader accounts / login.
- No editing of media by the uploader after submission.
- No public visibility of submissions to other uploaders.
- No backfill of tests for the rest of the app (only this feature's critical logic).
- No RAW image support beyond what the existing pipeline already handles.

---

## 3. Existing building blocks (reused)

- **Presigned-S3 upload pattern**: `app/api/admin/albums/[id]/presign/route.ts` (generate presigned PUT URLs) + `confirm-upload/route.ts` (verify S3 object, create `Photo`, enqueue jobs).
- **S3 service** (`lib/s3.ts`): `generateKey`, `getPresignedUploadUrl`, `objectExists`, `getObjectMetadata`, `getSignedUrl`, `deleteObject`. **Add:** `copyObject(srcKey, destKey)` for server-side promote.
- **Processing queues** (`lib/queues/`): `thumbnailQueue`, `blurhashQueue`, `exifQueue`, `videoThumbnailQueue` (BullMQ + ioredis).
- **Media helpers** (`lib/utils.ts`): `isImageFile`, `isVideoFile`, MIME map.
- **Auth**: admin-only routes guard with `requireAdmin()` / `requireSuperAdmin()` from `lib/admin-auth.ts` (returns a `NextResponse` on failure); album-scoped access uses `lib/album-auth.ts`.
- **Models**: `Album` (has `path`, `slug`, `status`, `enabled`), `Photo` (album-scoped, cascade), `Video` (album-scoped, cascade), `User` (roles admin/superadmin/member).

**Notable gap:** there is **no** existing "create `Video` from an upload" path — videos currently enter only via the filesystem sync scanner (`prisma.video.create` appears nowhere). The promote step builds this (create `Video` row + enqueue `videoThumbnailQueue`).

---

## 4. Data model

Three new models, plus three enums. Pending media lives **only** here + in an `_dropbox/` S3 prefix until approval.

```prisma
model Dropbox {
  id                    String   @id @default(cuid())
  token                 String   @unique            // public URL slug (21-char nanoid)
  name                  String                      // admin label: "Jane's Wedding — Guest Uploads"
  destinationAlbumId    String?                     // where approved media lands (now or at approval)
  enabled               Boolean  @default(true)     // admin kill-switch
  expiresAt             DateTime?                    // link control: expiry
  passphraseHash        String?                      // link control: bcrypt hash of optional passphrase
  maxUploads            Int?                         // link control: total accepted-file cap
  acceptedCount         Int      @default(0)         // running total (enforces maxUploads atomically)
  maxFilesPerSubmission Int      @default(50)        // per-submission limit
  maxFileSizeBytes      Int      @default(52428800)  // per-file limit (50MB default)
  allowVideos           Boolean  @default(true)      // photos+videos vs photos-only
  createdById           String                       // admin (User) who created it
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  destinationAlbum      Album?              @relation(fields: [destinationAlbumId], references: [id], onDelete: SetNull)
  createdBy             User                @relation(fields: [createdById], references: [id])
  submissions           DropboxSubmission[]
  @@index([token])
}

model DropboxSubmission {
  id            String        @id @default(cuid())
  dropboxId     String
  uploaderName  String?                              // optional identity
  uploaderEmail String?
  message       String?       @db.Text
  ipHash        String?                              // salted hash of IP (privacy) for rate-limit/audit
  userAgent     String?
  reviewedAt    DateTime?                            // null = still has PENDING files
  createdAt     DateTime      @default(now())
  dropbox       Dropbox       @relation(fields: [dropboxId], references: [id], onDelete: Cascade)
  files         DropboxFile[]
  @@index([dropboxId, createdAt])
}

model DropboxFile {
  id              String            @id @default(cuid())
  submissionId    String
  filename        String                             // sanitized original name
  s3Key           String                             // _dropbox/<dropboxId>/<submissionId>/<uuid>_<name>
  contentType     String
  fileSize        Int
  kind            MediaKind                          // IMAGE | VIDEO
  status          DropboxFileStatus @default(PENDING)
  reviewedById    String?
  reviewedAt      DateTime?
  promotedPhotoId String?                            // audit link after approval
  promotedVideoId String?
  rejectionReason String?
  createdAt       DateTime          @default(now())
  submission      DropboxSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  @@index([submissionId])
  @@index([status])
}

enum MediaKind { IMAGE VIDEO }
enum DropboxFileStatus { PENDING APPROVED REJECTED }
```

Back-relations added: `Album.dropboxes Dropbox[]`, `User.dropboxes Dropbox[]`.

**Notes**
- Review is **per-file** (`DropboxFile.status`); `DropboxSubmission` groups files + holds optional identity for review context.
- `fileSize` / `maxFileSizeBytes` are `Int` (matches existing `Photo.fileSize`/`Video.fileSize`); caps per-file below ~2 GB, which is acceptable for v1.
- Applied via Prisma migration (Postgres). Regenerate client; ensure `prisma db push`/migrate runs in the dev compose `migrate` service.

---

## 5. Public upload flow (unauthenticated)

Routes under `/submit` and `/api/dropbox/*` — **never** `/api/admin`. Stateless: passphrase + Turnstile token are sent with the `presign` request (no session cookie). *(Alternative considered: a `/verify` endpoint issuing a short-lived signed cookie — rejected for v1 as unnecessary complexity.)*

### 5.1 `GET /submit/[token]` (Server Component)
Load `Dropbox` by `token`. Render one of:
- **Upload form** (Turnstile widget, optional name/email/message, file picker) — passphrase field first if `passphraseHash` set.
- Terminal state: *not found* / *disabled* / *expired* / *full* (`acceptedCount >= maxUploads`).

### 5.2 `POST /api/dropbox/[token]/presign`
1. Load dropbox; reject if `!enabled`, past `expiresAt`, or at cap.
2. **Verify Turnstile** token server-side (Cloudflare siteverify + `TURNSTILE_SECRET_KEY`).
3. **Verify passphrase** (bcrypt compare) if set.
4. **Rate-limit** by `ipHash` via Redis sliding window → `429` on exceed.
5. Validate declared `files[]`: count ≤ `maxFilesPerSubmission`; each `size` ≤ `maxFileSizeBytes`; `contentType` in allowlist (images always; video subset only if `allowVideos`).
6. Create `DropboxSubmission` + `DropboxFile` rows (`PENDING`); return **presigned PUT URLs** to staging keys `_dropbox/<dropboxId>/<submissionId>/<uuid>_<name>`.

### 5.3 Client PUTs each file directly to S3 (staging prefix).

### 5.4 `POST /api/dropbox/[token]/confirm`
1. For each file: `getObjectMetadata` → verify object exists **and enforce actual size + content-type**; **delete + reject** any violator (presigned PUT can't cap size, so real enforcement happens here).
2. **Atomic cap bump:** `UPDATE "Dropbox" SET "acceptedCount" = "acceptedCount" + $n WHERE id = $id AND ("maxUploads" IS NULL OR "acceptedCount" + $n <= "maxUploads")`. If 0 rows updated → drop filled mid-flight; reject overflow + clean up their S3 objects.
3. Return thank-you state.

`MediaKind` derived via `isImageFile`/`isVideoFile`. The `_dropbox/` prefix sits outside every `album.path`, so the sync scanner and gallery never see staged objects.

---

## 6. Admin review & approval flow

Under `/api/admin/*` and `/admin/*`, gated by `requireAdmin()` (from `lib/admin-auth.ts`), matching every other admin route.

### 6.1 Dropbox management
- `GET /api/admin/dropboxes` — list with rollup counts (pending/approved/rejected, `acceptedCount` vs `maxUploads`, enabled, expiry).
- `POST /api/admin/dropboxes` — create; returns `token` + full `/submit/<token>` URL.
- `PATCH /api/admin/dropboxes/[id]` — edit settings, enable/disable, set/change destination, **rotate token**.
- `DELETE /api/admin/dropboxes/[id]` — cascade-delete submissions/files **and** purge the drop's `_dropbox/` S3 objects.

### 6.2 Review
- `GET /api/admin/dropboxes/[id]/submissions` — submissions grouped; each file carries a short-lived **signed preview URL** to its staging object.
- `POST /api/admin/dropboxes/[id]/review` — bulk `approve` / `reject` over a set of `DropboxFile` ids (+ optional destination album if the drop has none preset).

### 6.3 Promote-on-approve (core new logic), per approved file
1. Resolve destination album (`dropbox.destinationAlbumId` or the one passed in the review call). Error if none.
2. **Server-side S3 copy** staging key → `s3.generateKey(album.path, filename)`, then delete the staging original (a "move"). Handle filename collisions with a dedupe suffix. *(Adds `copyObject` to `lib/s3.ts`.)*
3. Create a **`Photo`** (IMAGE) or **`Video`** (VIDEO) row in the destination album.
4. Enqueue processing — Photo → `thumbnail` + `blurhash` + `exif` (mirrors `confirm-upload`); Video → `videoThumbnail` (net-new promote path).
5. Mark `DropboxFile` `APPROVED` + `promotedPhotoId`/`promotedVideoId` + reviewer/timestamp.

### 6.4 Reject
Delete the staging S3 object; mark `REJECTED` (+ optional `rejectionReason`). When all of a submission's files are reviewed, stamp `submission.reviewedAt`.

### 6.5 Admin UI
- `/admin/dropboxes` — table (name, destination, status, pending badge, cap usage, expiry, **copy public link**, enable/disable, delete) + "Create dropbox" dialog.
- `/admin/dropboxes/[id]` — review page: submissions with uploader context + thumbnail grid of pending files, per-file select + **bulk Approve/Reject**, destination-album picker when unset.
- Add "Dropboxes" to the admin nav.

---

## 7. Security & abuse hardening

Consolidated controls for the unauthenticated write path.

**Gate (at `presign`)**
- Turnstile verified server-side (single-use token per submission).
- Passphrase bcrypt-compared, constant-time, never returned.
- Rate limiting by salted `ipHash` via Redis (sliding window, e.g. N submissions + M files / hour / IP / drop) → `429`.
- Caps + MIME allowlist enforced server-side.

**Enforce-for-real (at `confirm`)**
- `getObjectMetadata` verifies actual size + content-type; violators deleted + rejected.
- Atomic `acceptedCount` bump enforces `maxUploads` under concurrency.

**Structural isolation**
- Pending media only in staging tables + `_dropbox/` prefix (no public read) → cannot surface in gallery/search/download by construction.
- Admin previews only via short-lived signed URLs.
- Presigned PUT URLs: per-key, content-type-bound, short TTL, UUID-suffixed keys.

**Data & input**
- IP stored as **salted hash**, not raw.
- Filename sanitized (existing regex); name/email/message length-capped, zod-validated, untrusted (React escapes on render).
- Token: 21-char nanoid, unique-indexed, **rotatable**; drop has enable/disable kill-switch + `expiresAt`.

**Lifecycle / storage-exhaustion**
- **Scheduled cleanup job** (BullMQ, mirroring `cleanup-jobs`): purge staging for abandoned-unconfirmed submissions older than *N* days + rejected leftovers.
- Drop delete/expire purges its staging prefix.

**Config**
- New env: `TURNSTILE_SITE_KEY` (public) + `TURNSTILE_SECRET_KEY` (server) + a `DROPBOX_IP_HASH_SALT`. Added to `.env.example` and docker compose env.
- Local/dev uses Cloudflare's **always-pass test keys** so the flow is testable without a Cloudflare account.

---

## 8. Testing & verification

The repo currently has **no test infrastructure** (no test script/framework/files). This feature introduces a minimal `vitest` setup (add devDep + `test` script) scoped to this feature's critical logic — not a whole-app backfill.

**Unit (`vitest`)**
- Validation: file count / size / MIME allowlist; `allowVideos` gate; `MediaKind` detection.
- Cap atomicity: the conditional-update logic (concurrent-confirm race).
- Passphrase: bcrypt hash/verify; wrong/empty rejected.
- Turnstile verify with the Cloudflare call **mocked** (success + failure).
- Promote mapping: `DropboxFile` → `Photo` vs `Video` shape + which queues enqueue (queues mocked).

**Integration (dockerized Postgres; S3 mocked or local MinIO)**
- presign→confirm→approve promotes into a real `Photo`/`Video` + enqueues jobs.
- reject deletes the staging S3 object.
- expired / disabled / full / wrong-passphrase / oversized / wrong-type all rejected.

**Manual verification** (de-facto pattern here) — checklist against the running Docker stack:
- Create drop → open `/submit/<token>` → upload a photo + a video (Turnstile test keys) → approve one, reject one → verify approved media appears in the destination album with thumbnails, rejected media is gone from S3, and cap/expiry/passphrase/disabled states behave. Happy path drivable via the Playwright MCP.

---

## 9. Open questions / follow-ups (post-v1)

- Email notification to the admin on new submissions, and/or to the uploader on approval (needs an email transport — not in scope now).
- Virus/malware scanning of uploads (currently only type/size validation + image re-encode via sharp on thumbnail generation).
- Per-file size > 2 GB (would require `BigInt` migration of `fileSize` across `Photo`/`Video`/`DropboxFile`).
- EXIF/metadata extraction for approved videos (the `exif` path is image-oriented today).

---

## 10. Rollout / migration notes

- Prisma migration for the three models + enums + back-relations; runs via `prisma migrate` / the dev compose `migrate` service (Prisma 7, Postgres).
- New env vars must be present before the public routes are enabled; fail closed (reject uploads) if Turnstile keys are missing in production.
- Ships behind the admin UI; a drop must be explicitly created + enabled before any public link is live.
