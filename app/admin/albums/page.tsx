"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { FolderOpen, Folder, Image, Settings, Trash2, Eye, EyeOff, ChevronRight, ChevronDown, Calendar, HardDrive, Cloud, CheckCircle2, XCircle, Clock, ImageIcon } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Album {
  id: string
  name: string
  description: string | null
  path: string
  slug: string
  status: "PUBLIC" | "PRIVATE"
  enabled: boolean
  syncedToS3: boolean
  localFilesSafeDelete: boolean
  lastSyncAt: string | null
  createdAt: string
  _count: {
    photos: number
  }
}

interface AlbumTreeNode {
  album: Album
  children: AlbumTreeNode[]
  level: number
  isExpanded: boolean
}

export default function AdminAlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [albumTree, setAlbumTree] = useState<AlbumTreeNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    slug: "",
    status: "PUBLIC" as "PUBLIC" | "PRIVATE",
    enabled: true
  })

  useEffect(() => {
    fetchAlbums()
  }, [])

  useEffect(() => {
    if (albums.length > 0) {
      buildAlbumTree()
    }
  }, [albums, expandedNodes])

  const buildAlbumTree = () => {
    const tree: AlbumTreeNode[] = []
    const nodeMap = new Map<string, AlbumTreeNode>()
    
    // Sort albums by path depth first, then alphabetically
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
      
      // Find parent node
      if (level === 0) {
        // Root level album
        tree.push(node)
      } else {
        // Find the parent album by checking if this album's path starts with another album's path
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
          // If no parent found, add to root
          tree.push(node)
        }
      }
    }
    
    setAlbumTree(tree)
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

  const renderAlbumNode = (node: AlbumTreeNode): React.ReactElement => {
    const { album, children, level, isExpanded } = node
    const hasChildren = children.length > 0
    const indentStyle = { paddingLeft: `${level * 24 + 12}px` }

    return (
      <div key={album.id}>
        {/* Album Row */}
        <div className="grid grid-cols-12 gap-4 py-3 px-3 border-b border-border/40 hover:bg-muted/30 transition-colors items-center text-sm" style={indentStyle}>
          {/* Album Name & Path - Col 1-4 */}
          <div className="col-span-4 flex items-center gap-2">
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-accent"
                onClick={() => toggleNode(album.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="w-6" />
            )}
            
            <Folder className="h-4 w-4 text-blue-600 flex-shrink-0" />
            
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{album.name}</div>
              <div className="text-xs text-muted-foreground truncate">{album.path}</div>
            </div>
          </div>

          {/* Photo Count - Col 5 */}
          <div className="col-span-1 text-center">
            <div className="flex items-center justify-center gap-1">
              <Image className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{album._count?.photos || 0}</span>
            </div>
          </div>

          {/* Status - Col 6-7 */}
          <div className="col-span-2 flex items-center gap-2">
            <Badge variant={album.status === "PUBLIC" ? "default" : "secondary"} className="text-xs">
              {album.status}
            </Badge>
            {!album.enabled && (
              <Badge variant="destructive" className="text-xs">Disabled</Badge>
            )}
          </div>

          {/* Sync Status - Col 8-9 */}
          <div className="col-span-2">
            <div className="flex items-center gap-1">
              {album.syncedToS3 ? (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              ) : (
                <XCircle className="h-3 w-3 text-red-600" />
              )}
              <span className="text-xs">
                {album.syncedToS3 ? "Synced" : "Not synced"}
              </span>
            </div>
          </div>

          {/* Last Sync - Col 10-11 */}
          <div className="col-span-2 text-xs text-muted-foreground">
            {album.lastSyncAt ? (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(album.lastSyncAt).toLocaleDateString()}
              </div>
            ) : (
              "Never"
            )}
          </div>

          {/* Actions - Col 12 */}
          <div className="col-span-1 flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              onClick={() => window.open(`/admin/albums/${album.id}/photos`, '_blank')}
              title="Browse Photos"
            >
              <ImageIcon className="h-3 w-3" />
            </Button>
            
            <Switch
              checked={album.enabled}
              onCheckedChange={() => toggleAlbumStatus(album)}
              className="data-[state=checked]:bg-green-600"
            />
            
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-6 w-6 p-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleEdit(album)}
                >
                  <Settings className="h-3 w-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Album</DialogTitle>
                  <DialogDescription>
                    Update album settings and visibility
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={editForm.name}
                      onChange={(e) => 
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={editForm.description}
                      onChange={(e) => 
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                      id="slug"
                      value={editForm.slug}
                      onChange={(e) => 
                        setEditForm({ ...editForm, slug: e.target.value })
                      }
                      placeholder="url-friendly-name"
                      pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    />
                    <p className="text-sm text-muted-foreground">
                      URL-friendly identifier (lowercase letters, numbers, and hyphens only)
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status">Visibility</Label>
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
                          <div className="flex items-center space-x-2">
                            <Eye className="h-4 w-4" />
                            <span>Public</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="PRIVATE">
                          <div className="flex items-center space-x-2">
                            <EyeOff className="h-4 w-4" />
                            <span>Private</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enabled"
                      checked={editForm.enabled}
                      onCheckedChange={(checked) => 
                        setEditForm({ ...editForm, enabled: checked })
                      }
                    />
                    <Label htmlFor="enabled">Enabled</Label>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setEditingAlbum(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="h-6 w-6 p-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Album</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{album.name}"? This action cannot be undone and will remove all associated photos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDelete(album.id)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

  const fetchAlbums = async () => {
    try {
      const response = await fetch("/api/admin/albums")
      if (response.ok) {
        const data = await response.json()
        setAlbums(data.albums)
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch albums",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch albums",
        variant: "destructive"
      })
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
      enabled: album.enabled
    })
  }

  const handleSave = async () => {
    if (!editingAlbum) return

    try {
      const response = await fetch(`/api/admin/albums/${editingAlbum.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(editForm)
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Album updated successfully"
        })
        setEditingAlbum(null)
        fetchAlbums()
      } else {
        throw new Error("Failed to update album")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update album",
        variant: "destructive"
      })
    }
  }

  const handleDelete = async (albumId: string) => {
    try {
      const response = await fetch(`/api/admin/albums/${albumId}`, {
        method: "DELETE"
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Album deleted successfully"
        })
        fetchAlbums()
      } else {
        throw new Error("Failed to delete album")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete album",
        variant: "destructive"
      })
    }
  }

  const toggleAlbumStatus = async (album: Album) => {
    try {
      const response = await fetch(`/api/admin/albums/${album.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          enabled: !album.enabled
        })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: `Album ${album.enabled ? "disabled" : "enabled"} successfully`
        })
        fetchAlbums()
      } else {
        throw new Error("Failed to toggle album status")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle album status",
        variant: "destructive"
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Album Management</h1>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4 animate-pulse">
                  <div className="w-6 h-6 bg-gray-200 rounded"></div>
                  <div className="w-5 h-5 bg-gray-200 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="w-12 h-4 bg-gray-200 rounded"></div>
                  <div className="w-16 h-4 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalPhotos = albums.reduce((sum: number, album) => sum + (album._count?.photos || 0), 0)
  const enabledAlbums = albums.filter(album => album.enabled).length
  const syncedAlbums = albums.filter(album => album.syncedToS3).length

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Album Management</h1>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{albums.length}</span>
            <span className="text-muted-foreground">albums</span>
          </div>
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totalPhotos.toLocaleString()}</span>
            <span className="text-muted-foreground">photos</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-medium">{enabledAlbums}</span>
            <span className="text-muted-foreground">enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{syncedAlbums}</span>
            <span className="text-muted-foreground">synced</span>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide px-12">
            <div className="col-span-4">Album & Path</div>
            <div className="col-span-1 text-center">Photos</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Sync Status</div>
            <div className="col-span-2">Last Sync</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {albums.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No albums found</h3>
              <p className="text-muted-foreground text-center">
                Albums will appear here after running a sync operation.
              </p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {albumTree.map(node => renderAlbumNode(node))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
