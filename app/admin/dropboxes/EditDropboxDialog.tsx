'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Album = { id: string; name: string };

export type EditableDropbox = {
  id: string;
  name: string;
  destinationAlbumId: string | null;
  maxUploads: number | null;
  maxFilesPerSubmission: number;
  maxFileSizeBytes: number;
  allowVideos: boolean;
  expiresAt: string | null;
  hasPassphrase: boolean;
};

const MB = 1024 * 1024;

// ISO string -> value for <input type="datetime-local"> in the browser's local time.
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function EditDropboxDialog({
  dropbox, albums, onClose, onSaved,
}: {
  dropbox: EditableDropbox;
  albums: Album[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('dropbox');
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: dropbox.name,
    destinationAlbumId: dropbox.destinationAlbumId ?? '',
    maxUploads: dropbox.maxUploads?.toString() ?? '',
    maxFilesPerSubmission: dropbox.maxFilesPerSubmission.toString(),
    maxFileSizeMb: Math.round(dropbox.maxFileSizeBytes / MB).toString(),
    allowVideos: dropbox.allowVideos,
    expiresAt: toDatetimeLocal(dropbox.expiresAt),
    newPassphrase: '',
    removePassphrase: false,
    rotateToken: false,
  });

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        destinationAlbumId: form.destinationAlbumId || null,
        maxUploads: form.maxUploads ? Number(form.maxUploads) : null,
        maxFilesPerSubmission: Number(form.maxFilesPerSubmission),
        maxFileSizeBytes: Number(form.maxFileSizeMb) * MB,
        allowVideos: form.allowVideos,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (form.rotateToken) body.rotateToken = true;
      if (form.removePassphrase) body.passphrase = '';
      else if (form.newPassphrase) body.passphrase = form.newPassphrase;

      const res = await fetch(`/api/admin/dropboxes/${dropbox.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('saveFailed'));
      toast({ title: t('saved') });
      onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : t('saveFailed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('editTitle')}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <Input placeholder={t('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="rounded-md border p-2" value={form.destinationAlbumId} onChange={(e) => setForm({ ...form, destinationAlbumId: e.target.value })}>
            <option value="">{t('noDestinationOption')}</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Input type="number" placeholder={t('maxUploadsPlaceholder')} value={form.maxUploads} onChange={(e) => setForm({ ...form, maxUploads: e.target.value })} />
          <label className="text-xs text-muted-foreground">{t('maxFilesLabel')}
            <Input type="number" value={form.maxFilesPerSubmission} onChange={(e) => setForm({ ...form, maxFilesPerSubmission: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground">{t('maxFileSizeLabel')}
            <Input type="number" value={form.maxFileSizeMb} onChange={(e) => setForm({ ...form, maxFileSizeMb: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground">{t('expiryLabel')}
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowVideos} onChange={(e) => setForm({ ...form, allowVideos: e.target.checked })} /> {t('allowVideos')}</label>
          <Input type="password" placeholder={t('newPassphrase')} value={form.newPassphrase} disabled={form.removePassphrase} onChange={(e) => setForm({ ...form, newPassphrase: e.target.value })} />
          {dropbox.hasPassphrase && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.removePassphrase} onChange={(e) => setForm({ ...form, removePassphrase: e.target.checked })} /> {t('removePassphrase')}</label>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.rotateToken} onChange={(e) => setForm({ ...form, rotateToken: e.target.checked })} /> {t('rotateToken')}</label>
          <Button disabled={saving || !form.name} onClick={save}>{t('save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
