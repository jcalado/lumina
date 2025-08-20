"use client"

import { useState, useEffect } from "react"
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
import { FolderOpen, Image, Settings, Trash2, Eye, EyeOff } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Album {
  id: string
  name: string
  description: string | null
  path: string
  status: "PUBLIC" | "PRIVATE"
  enabled: boolean
  createdAt: string
  _count: {
    photos: number
  }
}

export default function AdminAlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "PUBLIC" as "PUBLIC" | "PRIVATE",
    enabled: true
  })

  useEffect(() => {
    fetchAlbums()
  }, [])

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
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Album Management</h1>
        <div className="text-sm text-muted-foreground">
          {albums.length} album{albums.length !== 1 ? "s" : ""} total
        </div>
      </div>

      <div className="grid gap-4">
        {albums.map((album) => (
          <Card key={album.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1 flex-1">
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-lg">{album.name}</CardTitle>
                  <Badge variant={album.status === "PUBLIC" ? "default" : "secondary"}>
                    {album.status}
                  </Badge>
                  {!album.enabled && (
                    <Badge variant="destructive">Disabled</Badge>
                  )}
                </div>
                <CardDescription>
                  {album.description || "No description"}
                </CardDescription>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <FolderOpen className="h-4 w-4" />
                    <span>{album.path}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Image className="h-4 w-4" />
                    <span>{album._count.photos} photos</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  checked={album.enabled}
                  onCheckedChange={() => toggleAlbumStatus(album)}
                />
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(album)}
                    >
                      <Settings className="h-4 w-4" />
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={editForm.description}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                        />
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
                          onCheckedChange={(checked: boolean) => 
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
                    <Button variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 text-red-500" />
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
            </CardHeader>
          </Card>
        ))}
      </div>
      
      {albums.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No albums found</h3>
            <p className="text-muted-foreground text-center">
              Albums will appear here after running a sync operation.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
