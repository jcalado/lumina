"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Edit, UsersRound, FolderOpen, Upload, Pencil, TrashIcon, FolderPlus } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Group {
  id: string
  name: string
  description: string | null
  albumId: string
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
  album: { id: string; name: string; path: string }
  _count: { members: number }
}

interface Album {
  id: string
  name: string
  path: string
}

interface GroupForm {
  name: string
  description: string
  albumId: string
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
}

const emptyForm: GroupForm = {
  name: "",
  description: "",
  albumId: "",
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canCreateSubalbums: false,
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)
  const [form, setForm] = useState<GroupForm>(emptyForm)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [groupsRes, albumsRes] = await Promise.all([
        fetch("/api/admin/groups"),
        fetch("/api/admin/albums"),
      ])
      if (groupsRes.ok) {
        const data = await groupsRes.json()
        setGroups(data.groups)
      }
      if (albumsRes.ok) {
        const data = await albumsRes.json()
        setAlbums(data.albums.map((a: any) => ({ id: a.id, name: a.name, path: a.path })))
      }
    } catch {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.albumId) {
      toast({ title: "Error", description: "Name and album are required", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          albumId: form.albumId,
          canUpload: form.canUpload,
          canEdit: form.canEdit,
          canDelete: form.canDelete,
          canCreateSubalbums: form.canCreateSubalbums,
        }),
      })
      if (res.ok) {
        toast({ title: "Success", description: "Group created" })
        setShowCreateDialog(false)
        setForm(emptyForm)
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: "Error", description: err.error || "Failed to create group", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to create group", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editingGroup || !form.name.trim() || !form.albumId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/groups/${editingGroup.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          albumId: form.albumId,
          canUpload: form.canUpload,
          canEdit: form.canEdit,
          canDelete: form.canDelete,
          canCreateSubalbums: form.canCreateSubalbums,
        }),
      })
      if (res.ok) {
        toast({ title: "Success", description: "Group updated" })
        setEditingGroup(null)
        setForm(emptyForm)
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: "Error", description: err.error || "Failed to update group", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to update group", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingGroup) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/groups/${deletingGroup.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Success", description: "Group deleted" })
        setDeletingGroup(null)
        fetchData()
      } else {
        toast({ title: "Error", description: "Failed to delete group", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete group", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const openEditDialog = (group: Group) => {
    setEditingGroup(group)
    setForm({
      name: group.name,
      description: group.description || "",
      albumId: group.albumId,
      canUpload: group.canUpload,
      canEdit: group.canEdit,
      canDelete: group.canDelete,
      canCreateSubalbums: group.canCreateSubalbums,
    })
  }

  const permissionBadges = (group: Group) => {
    const perms: string[] = []
    if (group.canUpload) perms.push("Upload")
    if (group.canEdit) perms.push("Edit")
    if (group.canDelete) perms.push("Delete")
    if (group.canCreateSubalbums) perms.push("Create Sub-albums")
    return perms
  }

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. ACNAC Editors"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional description"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-album">Album</Label>
        <Select value={form.albumId} onValueChange={(v) => setForm({ ...form, albumId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select an album" />
          </SelectTrigger>
          <SelectContent>
            {albums
              .sort((a, b) => a.path.localeCompare(b.path))
              .map((album) => (
                <SelectItem key={album.id} value={album.id}>
                  {album.path}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Members will have access to this album and all its sub-albums.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Permissions</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canUpload} onCheckedChange={(c) => setForm({ ...form, canUpload: c === true })} />
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            Upload photos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canEdit} onCheckedChange={(c) => setForm({ ...form, canEdit: c === true })} />
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            Edit album settings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canDelete} onCheckedChange={(c) => setForm({ ...form, canDelete: c === true })} />
            <TrashIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Delete albums &amp; photos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canCreateSubalbums} onCheckedChange={(c) => setForm({ ...form, canCreateSubalbums: c === true })} />
            <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
            Create sub-albums
          </label>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Groups</h1>
        <div className="flex justify-center py-8">
          <div className="text-sm text-muted-foreground">Loading groups...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Groups</h1>
        <Button onClick={() => { setForm(emptyForm); setShowCreateDialog(true) }}>
          <Plus className="h-4 w-4" />
          Create Group
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission Groups</CardTitle>
          <CardDescription>
            Assign member users to groups to grant scoped album access with configurable permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No groups yet. Create a group to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Album</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <Link href={`/admin/groups/${group.id}`} className="font-medium hover:underline">
                        {group.name}
                      </Link>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{group.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {group.album.path}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {permissionBadges(group).map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {p}
                          </Badge>
                        ))}
                        {permissionBadges(group).length === 0 && (
                          <span className="text-xs text-muted-foreground">Read only</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <UsersRound className="h-3.5 w-3.5 text-muted-foreground" />
                        {group._count.members}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(group)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeletingGroup(group)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(o) => { if (!o) setShowCreateDialog(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Create a permission group to grant members access to an album and its sub-albums.
            </DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting || !form.name.trim() || !form.albumId}>
              {submitting ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(o) => { if (!o) { setEditingGroup(null); setForm(emptyForm) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>Update group settings and permissions.</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingGroup(null); setForm(emptyForm) }} disabled={submitting}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting || !form.name.trim() || !form.albumId}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingGroup} onOpenChange={(o) => { if (!o) setDeletingGroup(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingGroup?.name}&rdquo;? All member associations will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={submitting}>
              {submitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
