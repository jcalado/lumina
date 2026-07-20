'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Album = { id: string; name: string };
type Dropbox = { id: string; name: string; token: string; enabled: boolean; pendingCount: number; acceptedCount: number; maxUploads: number | null; hasPassphrase: boolean; destinationAlbum: { name: string } | null };

export function DropboxList({ albums }: { albums: Album[] }) {
  const [dropboxes, setDropboxes] = useState<Dropbox[]>([]);
  const [open, setOpen] = useState(false);
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
    if (!confirm(`Delete "${d.name}" and all its pending uploads?`)) return;
    await fetch(`/api/admin/dropboxes/${d.id}`, { method: 'DELETE' }); load();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dropboxes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Create dropbox</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New dropbox</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className="rounded-md border p-2" value={form.destinationAlbumId} onChange={(e) => setForm({ ...form, destinationAlbumId: e.target.value })}>
                <option value="">Choose destination later</option>
                {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Input type="number" placeholder="Max total uploads (optional)" value={form.maxUploads} onChange={(e) => setForm({ ...form, maxUploads: e.target.value })} />
              <Input type="password" placeholder="Passphrase (optional)" value={form.passphrase} onChange={(e) => setForm({ ...form, passphrase: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowVideos} onChange={(e) => setForm({ ...form, allowVideos: e.target.checked })} /> Allow videos</label>
              <Button disabled={!form.name} onClick={create}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {dropboxes.length === 0 && <p className="p-4 text-muted-foreground">No dropboxes yet.</p>}
        {dropboxes.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <a href={`/admin/dropboxes/${d.id}`} className="font-medium hover:underline">{d.name}</a>
              <p className="truncate text-xs text-muted-foreground">
                {d.destinationAlbum?.name ?? 'no destination'} · {d.acceptedCount}{d.maxUploads ? `/${d.maxUploads}` : ''} accepted
                {d.pendingCount > 0 && ` · ${d.pendingCount} pending`}{d.hasPassphrase && ' · 🔒'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${location.origin}/submit/${d.token}`)}>Copy link</Button>
              <Button variant="outline" size="sm" onClick={() => toggle(d)}>{d.enabled ? 'Disable' : 'Enable'}</Button>
              <Button variant="destructive" size="sm" onClick={() => remove(d)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
