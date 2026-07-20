'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EditDropboxDialog } from './EditDropboxDialog';

const NO_ALBUM = '__none';

type Album = { id: string; name: string };
type Dropbox = {
  id: string; name: string; token: string; enabled: boolean; pendingCount: number; acceptedCount: number;
  maxUploads: number | null; hasPassphrase: boolean; destinationAlbum: { name: string } | null;
  destinationAlbumId: string | null; allowVideos: boolean; expiresAt: string | null;
  maxFilesPerSubmission: number; maxFileSizeBytes: number;
};

export function DropboxList({ albums }: { albums: Album[] }) {
  const t = useTranslations('dropbox');
  const { toast } = useToast();
  const [dropboxes, setDropboxes] = useState<Dropbox[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dropbox | null>(null);
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
    if (!confirm(t('deleteConfirm', { name: d.name }))) return;
    await fetch(`/api/admin/dropboxes/${d.id}`, { method: 'DELETE' }); load();
  }
  async function copyLink(d: Dropbox) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/submit/${d.token}`);
      toast({ title: t('linkCopied') });
    } catch {
      toast({ title: t('copyFailed'), variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>{t('create')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('newDropbox')}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              <Input placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Select value={form.destinationAlbumId || NO_ALBUM} onValueChange={(v) => setForm({ ...form, destinationAlbumId: v === NO_ALBUM ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ALBUM}>{t('chooseDestinationLater')}</SelectItem>
                  {albums.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" placeholder={t('maxUploadsPlaceholder')} value={form.maxUploads} onChange={(e) => setForm({ ...form, maxUploads: e.target.value })} />
              <Input type="password" placeholder={t('passphraseOptional')} value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} />
              <div className="flex items-center gap-2">
                <Checkbox id="create-allow-videos" checked={form.allowVideos} onCheckedChange={(v) => setForm({ ...form, allowVideos: v === true })} />
                <Label htmlFor="create-allow-videos">{t('allowVideos')}</Label>
              </div>
              <Button disabled={!form.name} onClick={create}>{t('createButton')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {dropboxes.length === 0 && <p className="p-4 text-muted-foreground">{t('empty')}</p>}
        {dropboxes.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <a href={`/admin/dropboxes/${d.id}`} className="font-medium hover:underline">{d.name}</a>
              <p className="truncate text-xs text-muted-foreground">
                {d.destinationAlbum?.name ?? t('noDestination')} · {d.acceptedCount}{d.maxUploads ? `/${d.maxUploads}` : ''} {t('accepted')}
                {d.pendingCount > 0 && ` · ${d.pendingCount} ${t('pendingLabel')}`}{d.hasPassphrase && ' · 🔒'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => copyLink(d)}>{t('copyLink')}</Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(d)}>{t('edit')}</Button>
              <Button variant="outline" size="sm" onClick={() => toggle(d)}>{d.enabled ? t('disable') : t('enable')}</Button>
              <Button variant="destructive" size="sm" onClick={() => remove(d)}>{t('delete')}</Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditDropboxDialog
          key={editing.id}
          dropbox={editing}
          albums={albums}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
