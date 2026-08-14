'use client';
import { useRef, useState } from 'react';
import Script from 'next/script';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  token: string; requiresPassphrase: boolean; allowVideos: boolean;
  maxFiles: number; maxFileSizeBytes: number; turnstileSiteKey: string;
};

declare global {
  interface Window {
    turnstile?: {
      getResponse: (id?: string) => string | undefined;
      reset: (id?: string) => void;
      isExpired: (id?: string) => boolean;
    };
  }
}

export function DropboxUploader(props: Props) {
  const t = useTranslations('dropbox');
  const [files, setFiles] = useState<File[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const widgetRef = useRef<HTMLDivElement>(null);

  const accept = props.allowVideos ? 'image/*,video/*' : 'image/*';

  /**
   * A crashed route handler answers with an empty body, so calling .json() on
   * it throws "unexpected end of data" and buries the real status. Report what
   * the server actually said instead.
   */
  async function errorFrom(res: Response, fallback: string): Promise<Error> {
    const body = await res.text().catch(() => '');
    try {
      return new Error(JSON.parse(body).error || fallback);
    } catch {
      return new Error(`${fallback} (HTTP ${res.status})`);
    }
  }

  async function onSubmit() {
    setError(''); setStatus('uploading');
    try {
      // Tokens are single-use and expire after 300s, so a stale one from a
      // previous attempt (or a slow file pick) is rejected server-side. Take a
      // fresh one whenever the widget says the current token is spent.
      if (props.turnstileSiteKey && window.turnstile?.isExpired?.()) window.turnstile.reset();
      const turnstileToken = window.turnstile?.getResponse();
      if (props.turnstileSiteKey && !turnstileToken) throw new Error(t('completeChallenge'));

      const presignRes = await fetch(`/api/dropbox/${props.token}/presign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnstileToken, passphrase: props.requiresPassphrase ? passphrase : undefined,
          meta: { uploaderName: name, uploaderEmail: email, message },
          files: files.map((f) => ({ filename: f.name, contentType: f.type || 'application/octet-stream', size: f.size })),
        }),
      });
      if (!presignRes.ok) throw await errorFrom(presignRes, t('uploadFailed'));
      const { submissionId, uploads } = await presignRes.json();

      // A rejected PUT used to pass silently here, leaving confirm to discard
      // the missing objects and report a bare "0 accepted".
      const puts = await Promise.all(uploads.map((u: { presignedUrl: string }, i: number) =>
        fetch(u.presignedUrl, { method: 'PUT', body: files[i], headers: { 'Content-Type': files[i].type || 'application/octet-stream' } })
      ));
      const failed = puts.filter((r) => !r.ok);
      if (failed.length > 0) throw new Error(t('storageRejected', { count: failed.length, status: failed[0].status }));

      const confirmRes = await fetch(`/api/dropbox/${props.token}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId }),
      });
      if (!confirmRes.ok) throw await errorFrom(confirmRes, t('finalizeFailed'));
      setStatus('done');
    } catch (e) {
      // The attempt burned the token even if it failed later (bad passphrase,
      // oversized file). Without a reset every retry replays a spent token and
      // comes back as a verification failure.
      if (props.turnstileSiteKey) window.turnstile?.reset?.();
      setError(e instanceof Error ? e.message : t('uploadFailed')); setStatus('error');
    }
  }

  if (status === 'done') {
    return <div className="rounded-lg border p-6 text-center"><h2 className="text-lg font-medium">{t('thankYou')}</h2><p className="text-muted-foreground">{t('received')}</p></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {props.turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <Input type="file" multiple accept={accept} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      {props.requiresPassphrase && <Input type="password" placeholder={t('passphrase')} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
      <Input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Input type="email" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder={t('messagePlaceholder')} value={message} onChange={(e) => setMessage(e.target.value)} />
      {props.turnstileSiteKey && <div ref={widgetRef} className="cf-turnstile" data-sitekey={props.turnstileSiteKey} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={status === 'uploading' || files.length === 0} onClick={onSubmit}>
        {status === 'uploading' ? t('uploading') : t('uploadButton', { count: files.length })}
      </Button>
    </div>
  );
}
