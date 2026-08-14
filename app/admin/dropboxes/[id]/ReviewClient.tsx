'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlbumSelectItems, type SelectableAlbum } from '@/components/Admin/AlbumSelectItems';

type File = { id: string; filename: string; kind: 'IMAGE' | 'VIDEO'; status: string; previewUrl: string | null };
type Submission = { id: string; uploaderName: string | null; uploaderEmail: string | null; message: string | null; createdAt: string; files: File[] };
type Album = SelectableAlbum;

export function ReviewClient({ dropboxId, dropboxName, destinationAlbumId, albums }: { dropboxId: string; dropboxName: string; destinationAlbumId: string | null; albums: Album[] }) {
  const t = useTranslations('dropbox');
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
    if (action === 'approve' && !albumId) { alert(t('pickDestinationFirst')); return; }
    const res = await fetch(`/api/admin/dropboxes/${dropboxId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, fileIds, destinationAlbumId: albumId || undefined }),
    });
    if (!res.ok) alert((await res.json()).error || t('failed'));
    setSelected(new Set()); load();
  }

  const pending = submissions.flatMap((s) => s.files.filter((f) => f.status === 'PENDING'));

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{dropboxName}</h1>
      <div className="sticky top-0 flex items-center gap-2 bg-background py-2">
        <Select value={albumId} onValueChange={setAlbumId}>
          <SelectTrigger className="w-72"><SelectValue placeholder={t('destinationAlbum')} /></SelectTrigger>
          <SelectContent>
            <AlbumSelectItems albums={albums} />
          </SelectContent>
        </Select>
        <Button disabled={selected.size === 0} onClick={() => review('approve')}>{t('approve')}{selected.size ? ` ${selected.size}` : ''}</Button>
        <Button variant="destructive" disabled={selected.size === 0} onClick={() => review('reject')}>{t('reject')}{selected.size ? ` ${selected.size}` : ''}</Button>
        <span className="ml-auto text-sm text-muted-foreground">{t('pendingCount', { count: pending.length })}</span>
      </div>

      {submissions.map((sub) => (
        <div key={sub.id} className="rounded-lg border p-4">
          <div className="mb-2 text-sm text-muted-foreground">
            {sub.uploaderName || t('anonymous')} {sub.uploaderEmail ? `· ${sub.uploaderEmail}` : ''} · {new Date(sub.createdAt).toLocaleString()}
            {sub.message && <p className="mt-1 italic">&quot;{sub.message}&quot;</p>}
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
