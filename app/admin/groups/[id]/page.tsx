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
import { ArrowLeft, Plus, Trash2, UsersRound, FolderOpen, Upload, Pencil, TrashIcon, FolderPlus } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface GroupMember {
  id: string
  userId: string
  user: { id: string; email: string; name: string; role: string }
}

interface GroupDetail {
  id: string
  name: string
  description: string | null
  albumId: string
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
  album: { id: string; name: string; path: string }
  members: GroupMember[]
}

interface MemberUser {
  id: string
  email: string
  name: string
  role: string
}

export default function GroupDetailPage() {
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
      toast({ title: "Error", description: "Failed to load group", variant: "destructive" })
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
        toast({ title: "Success", description: "Member added" })
        setShowAddMemberDialog(false)
        setSelectedUserId("")
        fetchData()
      } else {
        const err = await res.json()
        toast({ title: "Error", description: err.error || "Failed to add member", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to add member", variant: "destructive" })
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
        toast({ title: "Success", description: "Member removed" })
        fetchData()
      } else {
        toast({ title: "Error", description: "Failed to remove member", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to remove member", variant: "destructive" })
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
            Back to Groups
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">Loading group...</div>
      </div>
    )
  }

  if (!group) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups
          </Link>
        </Button>
        <Card>
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-medium mb-2">Group not found</h3>
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
    { key: "canUpload", label: "Upload photos", icon: Upload, enabled: group.canUpload },
    { key: "canEdit", label: "Edit album settings", icon: Pencil, enabled: group.canEdit },
    { key: "canDelete", label: "Delete albums & photos", icon: TrashIcon, enabled: group.canDelete },
    { key: "canCreateSubalbums", label: "Create sub-albums", icon: FolderPlus, enabled: group.canCreateSubalbums },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups
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
            <CardTitle className="text-base">Album Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{group.album.name}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{group.album.path}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Includes all sub-albums under this path.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {permissionsList.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-sm">
                  <p.icon className={`h-3.5 w-3.5 ${p.enabled ? "text-foreground" : "text-muted-foreground/40"}`} />
                  <span className={p.enabled ? "" : "text-muted-foreground/60 line-through"}>
                    {p.label}
                  </span>
                  {p.enabled && <Badge variant="secondary" className="text-xs ml-auto">Enabled</Badge>}
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
              <CardTitle>Members</CardTitle>
              <CardDescription>{group.members.length} member(s) in this group</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setSelectedUserId(""); setShowAddMemberDialog(true) }}>
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {group.members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No members yet. Add users to this group.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Actions</TableHead>
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
                          ? "Super Admin"
                          : member.user.role === "MEMBER"
                          ? "Member"
                          : "Admin"}
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
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Select a user to add to this group. They will gain the group&apos;s permissions on the linked album.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <SelectItem value="__none__" disabled>No available users</SelectItem>
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
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={submitting || !selectedUserId || selectedUserId === "__none__"}>
              {submitting ? "Adding..." : "Add Member"}
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
