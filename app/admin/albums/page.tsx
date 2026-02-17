"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { FolderOpen, Folder, Image, Trash2, Eye, EyeOff, ChevronRight, ChevronDown, CheckCircle2, GripVertical, MoreHorizontal, Settings, ExternalLink, Video, Plus } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"

interface Album {
  id: string
  name: string
  description: string | null
  path: string
  slug: string
  status: "PUBLIC" | "PRIVATE"
  enabled: boolean
  featured: boolean
  createdAt: string
  displayOrder?: number
  _count: {
    photos: number
    videos: number
  }
}

interface AlbumTreeNode {
  album: Album
  children: AlbumTreeNode[]
  level: number
  isExpanded: boolean
}

type AlbumPerms = { canUpload: boolean; canEdit: boolean; canDelete: boolean; canCreateSubalbums: boolean }
type PermissionsMap = Record<string, AlbumPerms> | null // null = full access (admin/superadmin)

export default function AdminAlbumsPage() {
  const t = useTranslations("adminAlbums")
  const { data: session } = useSession()
  const isFullAccess = session?.user?.role === "admin" || session?.user?.role === "superadmin"
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumTree, setAlbumTree] = useState<AlbumTreeNode[]>([])
  const [permissions, setPermissions] = useState<PermissionsMap>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  type DragInfo = { id: string; parentPath: string; level: number } | null
  const [dragging, setDragging] = useState<DragInfo>(null)
  const [loading, setLoading] = useState(true)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null)
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [createForm, setCreateForm] = useState({ name: "", description: "", parentPath: "" })
  const [createLoading, setCreateLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    slug: "",
    status: "PUBLIC" as "PUBLIC" | "PRIVATE",
    enabled: true,
    featured: false
  })

  useEffect(() => {
    fetchAlbums()
  }, [])

  useEffect(() => {
    if (albums.length > 0) {
      buildAlbumTree()
    }
  }, [albums, expandedNodes])

  const getParentPath = (path: string) => {
    const idx = path.lastIndexOf('/')
    return idx === -1 ? '' : path.substring(0, idx)
  }

  const sortNodesRecursively = (nodes: AlbumTreeNode[]): AlbumTreeNode[] => {
    const sorted = [...nodes]
    sorted.sort((a, b) => {
      const ao = a.album.displayOrder ?? 0
      const bo = b.album.displayOrder ?? 0
      if (ao !== bo) return ao - bo
      return a.album.name.localeCompare(b.album.name)
    })
    for (const n of sorted) {
      if (n.children && n.children.length) {
        n.children = sortNodesRecursively(n.children)
      }
    }
    return sorted
  }

  const buildAlbumTree = () => {
    const tree: AlbumTreeNode[] = []
    const nodeMap = new Map<string, AlbumTreeNode>()

    const sortedAlbums = [...albums].sort((a, b) => {
      const aDepth = a.path.split('/').length
      const bDepth = b.path.split('/').length
      if (aDepth !== bDepth) return aDepth - bDepth
      return a.path.localeCompare(b.path)
    })

    for (const album of sortedAlbums) {
      const level = album.path.split('/').length - 1
      const node: AlbumTreeNode = {
        album,
        children: [],
        level,
        isExpanded: expandedNodes.has(album.id)
      }

      nodeMap.set(album.id, node)

      if (level === 0) {
        tree.push(node)
      } else {
        let parentNode: AlbumTreeNode | null = null
        let maxParentPathLength = 0

        for (const [, potentialParent] of nodeMap) {
          if (potentialParent.album.path !== album.path &&
              album.path.startsWith(potentialParent.album.path + '/') &&
              potentialParent.album.path.length > maxParentPathLength) {
            parentNode = potentialParent
            maxParentPathLength = potentialParent.album.path.length
          }
        }

        if (parentNode) {
          parentNode.children.push(node)
        } else {
          tree.push(node)
        }
      }
    }

    setAlbumTree(sortNodesRecursively(tree))
  }

  const reorderSiblingsInTree = (
    prevTree: AlbumTreeNode[],
    parentPath: string,
    fromId: string,
    toId: string
  ): AlbumTreeNode[] => {
    const reorderArray = (arr: AlbumTreeNode[], fromId: string, toId: string) => {
      const fromIdx = arr.findIndex(n => n.album.id === fromId)
      const toIdx = arr.findIndex(n => n.album.id === toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return arr
      const next = [...arr]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    }

    if (parentPath === '') {
      return reorderArray(prevTree, fromId, toId)
    }

    const dfs = (nodes: AlbumTreeNode[]): AlbumTreeNode[] => {
      return nodes.map(n => {
        if (n.album.path === parentPath) {
          return { ...n, children: reorderArray(n.children, fromId, toId) }
        }
        if (n.children && n.children.length) {
          return { ...n, children: dfs(n.children) }
        }
        return n
      })
    }
    return dfs(prevTree)
  }

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const getRecursiveMediaCount = (node: AlbumTreeNode): { photos: number; videos: number } => {
    let photos = node.album._count?.photos || 0
    let videos = node.album._count?.videos || 0
    for (const child of node.children) {
      const childCounts = getRecursiveMediaCount(child)
      photos += childCounts.photos
      videos += childCounts.videos
    }
    return { photos, videos }
  }

  const renderAlbumNode = (node: AlbumTreeNode): React.ReactElement => {
    const { album, children, level, isExpanded } = node
    const hasChildren = children.length > 0
    const indentStyle = { paddingLeft: `${level * 24 + 12}px` }
    const parentPath = getParentPath(album.path)
    const directCount = (album._count?.photos || 0) + (album._count?.videos || 0)
    const recursive = getRecursiveMediaCount(node)
    const totalCount = recursive.photos + recursive.videos

    return (
      <div key={album.id}>
        <div
          className="grid grid-cols-12 gap-2 md:gap-4 py-3 px-3 border-b border-border/40 hover:bg-muted/30 transition-colors items-center text-sm"
          style={indentStyle}
          draggable={isFullAccess}
          data-node-id={album.id}
          data-node-level={level}
          data-parent-path={parentPath}
          onDragStart={(e) => {
            setDragging({ id: album.id, parentPath, level })
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            const targetId = e.currentTarget.getAttribute('data-node-id') || ''
            const targetLevel = Number(e.currentTarget.getAttribute('data-node-level') || '0')
            const targetParentPath = e.currentTarget.getAttribute('data-parent-path') || ''
            if (!dragging) return
            if (dragging.id === targetId) return
            if (dragging.level !== targetLevel) return
            if (dragging.parentPath !== targetParentPath) return
            setAlbumTree(prev => reorderSiblingsInTree(prev, targetParentPath, dragging.id, targetId))
          }}
          onDragEnd={async () => {
            if (!dragging) return
            const currentParent = dragging.parentPath
            let order: string[] = []
            if (currentParent === '') {
              order = albumTree.map(n => n.album.id)
            } else {
              const findParent = (nodes: AlbumTreeNode[]): AlbumTreeNode | null => {
                for (const n of nodes) {
                  if (n.album.path === currentParent) return n
                  const found = findParent(n.children)
                  if (found) return found
                }
                return null
              }
              const parentNode = findParent(albumTree)
              if (parentNode) {
                order = parentNode.children.map(c => c.album.id)
              }
            }
            setDragging(null)
            try {
              const res = await fetch('/api/admin/albums/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order }),
              })
              if (!res.ok) throw new Error('Failed to save order')
              toast({ title: t('toastOrderUpdated'), description: t('toastOrderSaved') })
              fetchAlbums()
            } catch {
              toast({ title: t('toastError'), description: t('toastOrderFailed'), variant: 'destructive' })
            }
          }}
        >
          {/* Album Name & Path */}
          <div className="col-span-5 md:col-span-4 flex items-center gap-2 min-w-0">
            {isFullAccess ? (
              <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab shrink-0" />
            ) : (
              <div className="w-3 shrink-0" />
            )}
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-accent shrink-0"
                onClick={() => toggleNode(album.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="w-6 shrink-0" />
            )}

            <Folder className="h-4 w-4 text-blue-600 shrink-0" />

            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{album.name}</div>
              <div className="text-xs text-muted-foreground truncate">{album.path}</div>
            </div>
          </div>

          {/* Media Count */}
          <div className="col-span-1 hidden md:flex items-center justify-center">
            <div className="flex items-center gap-1 text-muted-foreground" title={hasChildren && directCount !== totalCount ? t('mediaDirect', { direct: directCount, total: totalCount }) : undefined}>
              <Image className="h-3 w-3" />
              <span className="font-medium text-foreground">{totalCount}</span>
            </div>
          </div>

          {/* Status Badges */}
          <div className="col-span-3 md:col-span-2 flex items-center gap-1.5 flex-wrap">
            <Badge variant={album.status === "PUBLIC" ? "default" : "secondary"} className="text-xs">
              {album.status === "PUBLIC" ? t("public") : t("private")}
            </Badge>
            {!album.enabled && (
              <Badge variant="destructive" className="text-xs">Off</Badge>
            )}
            {album.featured && (
              <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">{t("featuredToggle")}</Badge>
            )}
          </div>

          {/* Actions */}
          <div className="col-span-4 md:col-span-5 flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">{t("actions")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => window.open(`/admin/albums/${album.id}/photos`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t("browsePhotos")}
                </DropdownMenuItem>
                {albumCan(album.id, "canEdit") && (
                  <DropdownMenuItem onClick={() => handleEdit(album)}>
                    <Settings className="h-4 w-4 mr-2" />
                    {t("editSettings")}
                  </DropdownMenuItem>
                )}
                {albumCan(album.id, "canCreateSubalbums") && (
                  <DropdownMenuItem onClick={() => { setCreateForm({ name: "", description: "", parentPath: album.path }); setCreatingAlbum(true) }}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t("createSubAlbum")}
                  </DropdownMenuItem>
                )}
                {isFullAccess && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={album.enabled}
                      onCheckedChange={() => toggleAlbumStatus(album)}
                    >
                      {t("enabledToggle")}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={album.featured}
                      onCheckedChange={() => toggleFeatured(album)}
                    >
                      {t("featuredToggle")}
                    </DropdownMenuCheckboxItem>
                  </>
                )}
                {albumCan(album.id, "canDelete") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeletingAlbum(album)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("deleteAlbum")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderAlbumNode(child))}
          </div>
        )}
      </div>
    )
  }

  const albumCan = (albumId: string, perm: keyof AlbumPerms): boolean => {
    if (permissions === null) return true // full access
    return permissions[albumId]?.[perm] ?? false
  }

  const canCreateAny = isFullAccess || (permissions !== null && Object.values(permissions).some((p) => p.canCreateSubalbums))

  const fetchAlbums = async () => {
    try {
      const response = await fetch("/api/admin/albums")
      if (response.ok) {
        const data = await response.json()
        setAlbums(data.albums)
        setPermissions(data.permissions ?? null)
      } else {
        toast({ title: t("toastError"), description: t("toastFetchFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastFetchFailed"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (album: Album) => {
    setEditingAlbum(album)
    setEditForm({
      name: album.name,
      description: album.description || "",
      slug: album.slug,
      status: album.status,
      enabled: album.enabled,
      featured: album.featured
    })
  }

  const handleSave = async () => {
    if (!editingAlbum) return

    try {
      const response = await fetch(`/api/admin/albums/${editingAlbum.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      })

      if (response.ok) {
        toast({ title: t("toastSuccess"), description: t("toastAlbumUpdated") })
        setEditingAlbum(null)
        fetchAlbums()
      } else {
        throw new Error("Failed to update album")
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastUpdateFailed"), variant: "destructive" })
    }
  }

  const handleDelete = async (albumId: string) => {
    try {
      const response = await fetch(`/api/admin/albums/${albumId}`, { method: "DELETE" })

      if (response.ok) {
        toast({ title: t("toastSuccess"), description: t("toastAlbumDeleted") })
        setDeletingAlbum(null)
        fetchAlbums()
      } else {
        throw new Error("Failed to delete album")
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastDeleteFailed"), variant: "destructive" })
    }
  }

  const toggleAlbumStatus = async (album: Album) => {
    try {
      const response = await fetch(`/api/admin/albums/${album.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !album.enabled })
      })

      if (response.ok) {
        toast({ title: t("toastSuccess"), description: album.enabled ? t("toastAlbumDisabled") : t("toastAlbumEnabled") })
        fetchAlbums()
      } else {
        throw new Error("Failed to toggle album status")
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastToggleFailed"), variant: "destructive" })
    }
  }

  const toggleFeatured = async (album: Album) => {
    try {
      const response = await fetch(`/api/admin/albums/${album.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !album.featured })
      })

      if (response.ok) {
        toast({
          title: t("toastSuccess"),
          description: album.featured
            ? t("toastFeaturedRemoved", { name: album.name })
            : t("toastFeaturedAdded", { name: album.name })
        })
        fetchAlbums()
      } else {
        throw new Error("Failed to toggle featured")
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastFeaturedFailed"), variant: "destructive" })
    }
  }

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast({ title: t("toastError"), description: t("toastNameRequired"), variant: "destructive" })
      return
    }
    setCreateLoading(true)
    try {
      const response = await fetch("/api/admin/albums/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createForm.name.trim(), description: createForm.description.trim() || undefined, parentPath: createForm.parentPath || undefined })
      })
      if (response.ok) {
        toast({ title: t("toastSuccess"), description: t("toastAlbumCreated") })
        setCreatingAlbum(false)
        setCreateForm({ name: "", description: "", parentPath: "" })
        fetchAlbums()
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to create album")
      }
    } catch (error) {
      toast({ title: t("toastError"), description: error instanceof Error ? error.message : t("toastCreateFailed"), variant: "destructive" })
    } finally {
      setCreateLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4 animate-pulse">
                  <div className="w-6 h-6 bg-muted rounded" />
                  <div className="w-5 h-5 bg-muted rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="w-12 h-4 bg-muted rounded" />
                  <div className="w-16 h-4 bg-muted rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalPhotos = albums.reduce((sum, album) => sum + (album._count?.photos || 0), 0)
  const totalVideos = albums.reduce((sum, album) => sum + (album._count?.videos || 0), 0)
  const enabledAlbums = albums.filter(album => album.enabled).length
  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        {albums.length > 0 && (
          <div className="flex items-center gap-4 md:gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{albums.length}</span>
              <span className="text-muted-foreground hidden sm:inline">{t("albums")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{totalPhotos.toLocaleString()}</span>
              <span className="text-muted-foreground hidden sm:inline">{t("photos")}</span>
            </div>
            {totalVideos > 0 && (
              <div className="flex items-center gap-1.5">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{totalVideos.toLocaleString()}</span>
                <span className="text-muted-foreground hidden sm:inline">{t("videos")}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">{enabledAlbums}</span>
              <span className="text-muted-foreground hidden sm:inline">{t("enabled")}</span>
            </div>
            {(isFullAccess || canCreateAny) && (
              <Button size="sm" onClick={() => setCreatingAlbum(true)}>
                <Plus className="h-4 w-4" />
                {t("createAlbum")}
              </Button>
            )}
          </div>
        )}
      </div>

      {albums.length === 0 ? (
        <Empty className="border rounded-lg py-16">
          <EmptyMedia variant="icon">
            <FolderOpen className="h-5 w-5" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{t("noAlbumsTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("noAlbumsDescription")}
            </EmptyDescription>
          </EmptyHeader>
          {(isFullAccess || canCreateAny) && (
            <Button onClick={() => setCreatingAlbum(true)}>
              <Plus className="h-4 w-4" />
              {t("createAlbum")}
            </Button>
          )}
        </Empty>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="grid grid-cols-12 gap-2 md:gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide px-12">
              <div className="col-span-5 md:col-span-4">{t("columnAlbum")}</div>
              <div className="col-span-1 text-center hidden md:block">{t("columnMedia")}</div>
              <div className="col-span-3 md:col-span-2">{t("columnStatus")}</div>
              <div className="col-span-4 md:col-span-5 text-right">{t("columnActions")}</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              {albumTree.map(node => renderAlbumNode(node))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog — shared, page-level */}
      <Dialog open={!!editingAlbum} onOpenChange={(open) => { if (!open) setEditingAlbum(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("editDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("name")}</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">{t("description")}</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-slug">{t("urlSlug")}</Label>
              <Input
                id="edit-slug"
                value={editForm.slug}
                onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                placeholder={t("urlSlugPlaceholder")}
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              />
              <p className="text-sm text-muted-foreground">
                {t("urlSlugHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">{t("visibility")}</Label>
              <Select
                value={editForm.status}
                onValueChange={(value: "PUBLIC" | "PRIVATE") =>
                  setEditForm({ ...editForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      <span>{t("public")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="PRIVATE">
                    <div className="flex items-center gap-2">
                      <EyeOff className="h-4 w-4" />
                      <span>{t("private")}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-enabled"
                checked={editForm.enabled}
                onCheckedChange={(checked) =>
                  setEditForm({ ...editForm, enabled: checked })
                }
              />
              <Label htmlFor="edit-enabled">{t("enabledLabel")}</Label>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-featured"
                  checked={editForm.featured}
                  onCheckedChange={(checked) =>
                    setEditForm({ ...editForm, featured: checked })
                  }
                />
                <Label htmlFor="edit-featured">{t("featuredLabel")}</Label>
              </div>
              <p className="text-xs text-muted-foreground pl-11">
                {t("featuredHelp")}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingAlbum(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave}>
              {t("saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation — shared, page-level */}
      <AlertDialog open={!!deletingAlbum} onOpenChange={(open) => { if (!open) setDeletingAlbum(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialogDescription", { name: deletingAlbum?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingAlbum && handleDelete(deletingAlbum.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Album Dialog */}
      <Dialog open={creatingAlbum} onOpenChange={(open) => { if (!open) { setCreatingAlbum(false); setCreateForm({ name: "", description: "", parentPath: "" }) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">{t("name")}</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder={t("namePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-parent">{t("parentAlbum")}</Label>
              <Select
                value={createForm.parentPath}
                onValueChange={(value) => setCreateForm({ ...createForm, parentPath: value === "__none__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("parentNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("parentNone")}</SelectItem>
                  {albums
                    .sort((a, b) => a.path.localeCompare(b.path))
                    .map((album) => (
                    <SelectItem key={album.id} value={album.path}>
                      {album.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-description">{t("descriptionOptional")}</Label>
              <Textarea
                id="create-description"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setCreatingAlbum(false); setCreateForm({ name: "", description: "", parentPath: "" }) }}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={createLoading || !createForm.name.trim()}>
              {createLoading ? t("creating") : t("createAlbum")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
