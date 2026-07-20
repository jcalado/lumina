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
