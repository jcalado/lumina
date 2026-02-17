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
import { AlbumTreeSelect } from "@/components/Admin/AlbumTreeSelect"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Edit, UsersRound, FolderOpen, Upload, Pencil, TrashIcon, FolderPlus } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"

interface Group {
  id: string
  name: string
  description: string | null
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
  albums: { album: { id: string; name: string; path: string } }[]
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
  albumIds: string[]
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
}

const emptyForm: GroupForm = {
  name: "",
  description: "",
  albumIds: [],
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canCreateSubalbums: false,
}

export default function GroupsPage() {
  const t = useTranslations("adminGroups")
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
      toast({ title: t("toastError"), description: t("toastFetchFailed"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim() || form.albumIds.length === 0) {
      toast({ title: t("toastError"), description: t("toastNameAlbumRequired"), variant: "destructive" })
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
          albumIds: form.albumIds,
          canUpload: form.canUpload,
          canEdit: form.canEdit,
          canDelete: form.canDelete,
          canCreateSubalbums: form.canCreateSubalbums,
        }),
      })
      if (res.ok) {
        toast({ title: t("toastSuccess"), description: t("toastGroupCreated") })
        setShowCreateDialog(false)
        setForm(emptyForm)
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: t("toastError"), description: err.error || t("toastCreateFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastCreateFailed"), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editingGroup || !form.name.trim() || form.albumIds.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/groups/${editingGroup.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          albumIds: form.albumIds,
          canUpload: form.canUpload,
          canEdit: form.canEdit,
          canDelete: form.canDelete,
          canCreateSubalbums: form.canCreateSubalbums,
        }),
      })
      if (res.ok) {
        toast({ title: t("toastSuccess"), description: t("toastGroupUpdated") })
        setEditingGroup(null)
        setForm(emptyForm)
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: t("toastError"), description: err.error || t("toastUpdateFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastUpdateFailed"), variant: "destructive" })
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
        toast({ title: t("toastSuccess"), description: t("toastGroupDeleted") })
        setDeletingGroup(null)
        fetchData()
      } else {
        toast({ title: t("toastError"), description: t("toastDeleteFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastDeleteFailed"), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const openEditDialog = (group: Group) => {
    setEditingGroup(group)
    setForm({
      name: group.name,
      description: group.description || "",
      albumIds: group.albums.map((ga) => ga.album.id),
      canUpload: group.canUpload,
      canEdit: group.canEdit,
      canDelete: group.canDelete,
      canCreateSubalbums: group.canCreateSubalbums,
    })
  }

  const permissionBadges = (group: Group) => {
    const perms: string[] = []
    if (group.canUpload) perms.push(t("permUpload"))
    if (group.canEdit) perms.push(t("permEdit"))
    if (group.canDelete) perms.push(t("permDelete"))
    if (group.canCreateSubalbums) perms.push(t("permCreateSubalbums"))
    return perms
  }

  const formFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="group-name">{t("formName")}</Label>
        <Input
          id="group-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("formNamePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-description">{t("formDescription")}</Label>
        <Textarea
          id="group-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t("formDescriptionPlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-albums">{t("formAlbums")}</Label>
        <AlbumTreeSelect
          albums={albums}
          selectedAlbumIds={form.albumIds}
          onSelectionChange={(ids) => setForm({ ...form, albumIds: ids })}
        />
        <p className="text-xs text-muted-foreground">
          {t("formAlbumsHelp")}
        </p>
      </div>

      <div className="space-y-3">
        <Label>{t("formPermissions")}</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canUpload} onCheckedChange={(c) => setForm({ ...form, canUpload: c === true })} />
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            {t("permUploadPhotos")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canEdit} onCheckedChange={(c) => setForm({ ...form, canEdit: c === true })} />
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            {t("permEditAlbumSettings")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canDelete} onCheckedChange={(c) => setForm({ ...form, canDelete: c === true })} />
            <TrashIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {t("permDeleteAlbumsPhotos")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.canCreateSubalbums} onCheckedChange={(c) => setForm({ ...form, canCreateSubalbums: c === true })} />
            <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
            {t("permCreateSubalbumsLabel")}
          </label>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex justify-center py-8">
          <div className="text-sm text-muted-foreground">{t("loading")}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button onClick={() => { setForm(emptyForm); setShowCreateDialog(true) }}>
          <Plus className="h-4 w-4" />
          {t("createGroup")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("permissionGroups")}</CardTitle>
          <CardDescription>
            {t("permissionGroupsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("noGroupsEmpty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columnName")}</TableHead>
                  <TableHead>{t("columnAlbum")}</TableHead>
                  <TableHead>{t("columnPermissions")}</TableHead>
                  <TableHead>{t("columnMembers")}</TableHead>
                  <TableHead>{t("columnActions")}</TableHead>
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
                      <div className="space-y-0.5">
                        {group.albums.map((ga) => (
                          <div key={ga.album.id} className="flex items-center gap-1.5 text-sm">
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {ga.album.path}
                          </div>
                        ))}
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
                          <span className="text-xs text-muted-foreground">{t("readOnly")}</span>
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
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={submitting}>{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={submitting || !form.name.trim() || form.albumIds.length === 0}>
              {submitting ? t("creating") : t("createGroup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(o) => { if (!o) { setEditingGroup(null); setForm(emptyForm) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>
            <DialogDescription>{t("editDialogDescription")}</DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingGroup(null); setForm(emptyForm) }} disabled={submitting}>{t("cancel")}</Button>
            <Button onClick={handleEdit} disabled={submitting || !form.name.trim() || form.albumIds.length === 0}>
              {submitting ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingGroup} onOpenChange={(o) => { if (!o) setDeletingGroup(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription", { name: deletingGroup?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={submitting}>
              {submitting ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
