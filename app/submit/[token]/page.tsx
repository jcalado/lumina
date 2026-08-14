import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import { turnstileConfig } from '@/lib/dropbox/turnstile';
import { DropboxUploader } from './DropboxUploader';

export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('dropbox');
  const dropbox = await prisma.dropbox.findUnique({ where: { token } });

  const turnstile = turnstileConfig();
  if (turnstile.misconfigured) {
    // Every presign would reject with "Verification failed" — say so here rather
    // than after the visitor has picked their files.
    console.error('[dropbox] TURNSTILE_SECRET_KEY is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is not; uploads cannot succeed');
  }

  let state: 'open' | 'notfound' | 'expired' | 'full' | 'misconfigured' = 'open';
  if (!dropbox || !dropbox.enabled) state = 'notfound';
  else if (dropbox.expiresAt && dropbox.expiresAt < new Date()) state = 'expired';
  else if (dropbox.maxUploads !== null && dropbox.acceptedCount >= dropbox.maxUploads) state = 'full';
  else if (turnstile.misconfigured) state = 'misconfigured';

  if (state !== 'open' || !dropbox) {
    const msg = state === 'expired' ? t('linkExpired')
      : state === 'full' ? t('linkFull')
      : state === 'misconfigured' ? t('uploadsUnavailable')
      : t('linkNotFound');
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('unavailable')}</h1>
        <p className="text-muted-foreground">{msg}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{dropbox.name}</h1>
        <p className="text-muted-foreground">
          {dropbox.allowVideos ? t('uploadPromptPhotosVideos') : t('uploadPromptPhotos')}
        </p>
      </div>
      <DropboxUploader
        token={token}
        requiresPassphrase={!!dropbox.passphraseHash}
        allowVideos={dropbox.allowVideos}
        maxFiles={dropbox.maxFilesPerSubmission}
        maxFileSizeBytes={dropbox.maxFileSizeBytes}
        turnstileSiteKey={turnstile.siteKey}
      />
    </main>
  );
}
