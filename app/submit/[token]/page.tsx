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
