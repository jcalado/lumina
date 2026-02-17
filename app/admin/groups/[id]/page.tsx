"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Plus, Trash2, UsersRound, FolderOpen, Upload, Pencil, TrashIcon, FolderPlus, Check, X, ShieldCheck } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"

interface GroupMember {
  id: string
  userId: string
  user: { id: string; email: string; name: string; role: string }
}

interface GroupDetail {
  id: string
  name: string
  description: string | null
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
  albums: { album: { id: string; name: string; path: string } }[]
  members: GroupMember[]
}

interface MemberUser {
  id: string
  email: string
  name: string
  role: string
}

export default function GroupDetailPage() {
  const t = useTranslations("adminGroups")
  const params = useParams()
  const groupId = params.id as string

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [allUsers, setAllUsers] = useState<MemberUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchData()
  }, [groupId])

  const fetchData = async () => {
    try {
      const [groupRes, usersRes] = await Promise.all([
        fetch(`/api/admin/groups/${groupId}`),
        fetch("/api/admin/users"),
      ])
      if (groupRes.ok) {
        const data = await groupRes.json()
        setGroup(data.group)
      }
      if (usersRes.ok) {
        const users = await usersRes.json()
        setAllUsers(users)
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastLoadGroupFailed"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!selectedUserId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [selectedUserId] }),
      })
      if (res.ok) {
        toast({ title: t("toastSuccess"), description: t("toastMemberAdded") })
        setShowAddMemberDialog(false)
        setSelectedUserId("")
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: t("toastError"), description: err.error || t("toastAddMemberFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastAddMemberFailed"), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [userId] }),
      })
      if (res.ok) {
        toast({ title: t("toastSuccess"), description: t("toastMemberRemoved") })
        fetchData()
      } else {
        toast({ title: t("toastError"), description: t("toastRemoveMemberFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastRemoveMemberFailed"), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToGroups")}
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">{t("loadingGroup")}</div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToGroups")}
          </Link>
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-medium mb-2">{t("groupNotFound")}</h3>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Users available to add (MEMBER role, not already in group)
  const existingMemberIds = new Set(group.members.map((m) => m.user.id))
  const availableUsers = allUsers.filter(
    (u) => !existingMemberIds.has(u.id)
  )

  const permissionsList = [
    {
      key: "canUpload",
      label: t("permUploadPhotos"),
      icon: Upload,
      enabled: group.canUpload,
      activeClasses: "bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800",
      iconBg: "bg-sky-100 text-sky-600 dark:bg-sky-900 dark:text-sky-400",
      badgeClasses: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
    },
    {
      key: "canEdit",
      label: t("permEditAlbumSettings"),
      icon: Pencil,
      enabled: group.canEdit,
      activeClasses: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800",
      iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400",
      badgeClasses: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    },
    {
      key: "canDelete",
      label: t("permDeleteAlbumsPhotos"),
      icon: TrashIcon,
      enabled: group.canDelete,
      activeClasses: "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800",
      iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-400",
      badgeClasses: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    },
    {
      key: "canCreateSubalbums",
      label: t("permCreateSubalbumsLabel"),
      icon: FolderPlus,
      enabled: group.canCreateSubalbums,
      activeClasses: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800",
      iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400",
      badgeClasses: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("backToGroups")}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
        </div>
      </div>

      {/* Group Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("albumAccess")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {group.albums.map((ga) => (
                <div key={ga.album.id}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{ga.album.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground ml-6">{ga.album.path}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t("albumAccessSubtext")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              {t("permissions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {permissionsList.map((p) => (
                <div
                  key={p.key}
                  className={`relative rounded-lg border p-3 transition-colors ${
                    p.enabled
                      ? p.activeClasses
                      : "bg-muted/30 border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 rounded-md p-2 ${
                      p.enabled
                        ? p.iconBg
                        : "bg-muted text-muted-foreground/50"
                    }`}>
                      <p.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium leading-tight ${
                        p.enabled ? "text-foreground" : "text-muted-foreground"
                      }`}>
                        {p.label}
                      </p>
                      <div className="mt-1.5">
                        {p.enabled ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${p.badgeClasses}`}>
                            <Check className="h-3 w-3" />
                            {t("enabled")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <X className="h-3 w-3" />
                            {t("disabled")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("members")}</CardTitle>
              <CardDescription>{t("membersCount", { count: group.members.length })}</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setSelectedUserId(""); setShowAddMemberDialog(true) }}>
              <Plus className="h-4 w-4" />
              {t("addMember")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {group.members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{t("noMembersEmpty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("memberColumnName")}</TableHead>
                  <TableHead>{t("memberColumnEmail")}</TableHead>
                  <TableHead>{t("memberColumnRole")}</TableHead>
                  <TableHead>{t("memberColumnActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.user.name}</TableCell>
                    <TableCell>{member.user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {member.user.role === "SUPERADMIN"
                          ? t("roleSuperAdmin")
                          : member.user.role === "MEMBER"
                          ? t("roleMember")
                          : t("roleAdmin")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveMember(member.user.id)}
                        disabled={submitting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={(o) => { if (!o) setShowAddMemberDialog(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addMemberDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("addMemberDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("selectUser")}</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectUserPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <SelectItem value="__none__" disabled>{t("noAvailableUsers")}</SelectItem>
                  ) : (
                    availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)} disabled={submitting}>{t("cancel")}</Button>
            <Button onClick={handleAddMember} disabled={submitting || !selectedUserId || selectedUserId === "__none__"}>
              {submitting ? t("adding") : t("addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Label({ children, ...props }: { children: React.ReactNode } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="text-sm font-medium leading-none" {...props}>{children}</label>
}
