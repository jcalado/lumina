import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTurnstile } from '@/lib/dropbox/turnstile';
import { verifyPassphrase } from '@/lib/dropbox/passphrase';
import { checkRateLimit, hashIp, getClientIp } from '@/lib/dropbox/rate-limit';
import { validateDeclaredFiles, resolveMediaKind, sanitizeFilename, submissionMetaSchema, type DeclaredFile } from '@/lib/dropbox/validation';
import { getS3Service } from '@/lib/s3';
import { getContentType } from '@/lib/utils';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    return await presign(request, await params);
  } catch (e) {
    // An unhandled throw here answers with an empty body, which surfaces in the
    // browser as a JSON parse error rather than anything actionable. Common
    // causes: DROPBOX_IP_HASH_SALT unset in production, Redis unreachable, S3
    // credentials missing.
    console.error('[dropbox/presign] unhandled error:', e);
    return NextResponse.json({ error: 'Upload could not be started' }, { status: 500 });
  }
}

async function presign(request: NextRequest, { token }: { token: string }) {
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

  const rawFiles = body?.files;
  if (
    !Array.isArray(rawFiles) ||
    rawFiles.some((f) => !f || typeof f !== 'object' || typeof f.filename !== 'string' || typeof f.size !== 'number')
  ) {
    return NextResponse.json({ error: 'Invalid files' }, { status: 400 });
  }
  const files = rawFiles as DeclaredFile[];
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
      // Derive content-type server-side from the (validated) extension — never
      // trust the client's declared contentType, which is locked into the
      // presigned PUT and persisted.
      const contentType = getContentType(safe);
      const s3Key = `_dropbox/${dropbox.id}/${submission.id}/${crypto.randomUUID()}_${safe}`;
      const presignedUrl = await s3.getPresignedUploadUrl(s3Key, contentType, 900);
      await prisma.dropboxFile.create({
        data: { submissionId: submission.id, filename: safe, s3Key, contentType, fileSize: f.size, kind },
      });
      return { filename: safe, s3Key, presignedUrl };
    })
  );

  return NextResponse.json({ submissionId: submission.id, uploads });
}
