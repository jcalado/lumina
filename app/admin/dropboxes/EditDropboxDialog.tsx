'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NO_ALBUM = '__none';

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
          <Select value={form.destinationAlbumId || NO_ALBUM} onValueChange={(v) => setForm({ ...form, destinationAlbumId: v === NO_ALBUM ? '' : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ALBUM}>{t('noDestinationOption')}</SelectItem>
              {albums.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
          <div className="flex items-center gap-2">
            <Checkbox id="edit-allow-videos" checked={form.allowVideos} onCheckedChange={(v) => setForm({ ...form, allowVideos: v === true })} />
            <Label htmlFor="edit-allow-videos">{t('allowVideos')}</Label>
          </div>
          <Input type="password" placeholder={t('newPassphrase')} value={form.newPassphrase} disabled={form.removePassphrase} onChange={(e) => setForm({ ...form, newPassphrase: e.target.value })} />
          {dropbox.hasPassphrase && (
            <div className="flex items-center gap-2">
              <Checkbox id="edit-remove-passphrase" checked={form.removePassphrase} onCheckedChange={(v) => setForm({ ...form, removePassphrase: v === true })} />
              <Label htmlFor="edit-remove-passphrase">{t('removePassphrase')}</Label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="edit-rotate-token" checked={form.rotateToken} onCheckedChange={(v) => setForm({ ...form, rotateToken: v === true })} />
            <Label htmlFor="edit-rotate-token">{t('rotateToken')}</Label>
          </div>
          <Button disabled={saving || !form.name} onClick={save}>{t('save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
