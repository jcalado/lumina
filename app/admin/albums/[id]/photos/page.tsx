"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ArrowLeft, Image, Trash2, Search, Calendar, HardDrive, Download, Upload } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { PhotoImage } from "@/components/PhotoImage"
import { FileUploadModal } from "@/components/Admin/FileUploadModal"

interface Photo {
  id: string
  filename: string
  originalPath: string
  s3Key: string
  fileSize: number
  takenAt: string | null
  createdAt: string
  metadata?: any
}

interface Album {
  id: string
  name: string
  description: string | null
  path: string
  slug: string
  status: "PUBLIC" | "PRIVATE"
  enabled: boolean
  _count: {
    photos: number
  }
}

export default function AlbumPhotosPage() {
  const params = useParams()
  const albumId = params.id as string
  const { data: session } = useSession()
  const isFullAccess = session?.user?.role === "admin" || session?.user?.role === "superadmin"

  const [album, setAlbum] = useState<Album | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [deletingPhotos, setDeletingPhotos] = useState(false)
  const [downloadingSelected, setDownloadingSelected] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [canUpload, setCanUpload] = useState(false)
  const [canDelete, setCanDelete] = useState(false)

  useEffect(() => {
    fetchAlbumAndPhotos()
  }, [albumId])

  const fetchAlbumAndPhotos = async () => {
    try {
      setLoading(true)

      // Fetch album details and permissions in parallel
      const [albumResponse, photosResponse, albumsResponse] = await Promise.all([
        fetch(`/api/admin/albums/${albumId}`),
        fetch(`/api/admin/albums/${albumId}/photos`),
        fetch(`/api/admin/albums`),
      ])

      if (!albumResponse.ok) {
        throw new Error("Failed to fetch album")
      }
      const albumData = await albumResponse.json()
      setAlbum(albumData.album)

      if (!photosResponse.ok) {
        throw new Error("Failed to fetch photos")
      }
      const photosData = await photosResponse.json()
      setPhotos(photosData.photos)

      // Extract permissions for this album
      if (albumsResponse.ok) {
        const albumsData = await albumsResponse.json()
        const perms = albumsData.permissions
        if (perms === null || perms === undefined) {
          // Full access (admin/superadmin)
          setCanUpload(true)
          setCanDelete(true)
        } else {
          setCanUpload(perms[albumId]?.canUpload ?? false)
          setCanDelete(perms[albumId]?.canDelete ?? false)
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      toast({
        title: "Error",
        description: "Failed to load album photos",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredPhotos = photos.filter(photo =>
    photo.filename.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const togglePhotoSelection = (photoId: string) => {
    const newSelected = new Set(selectedPhotos)
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId)
    } else {
      newSelected.add(photoId)
    }
    setSelectedPhotos(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedPhotos.size === filteredPhotos.length) {
      setSelectedPhotos(new Set())
    } else {
      setSelectedPhotos(new Set(filteredPhotos.map(photo => photo.id)))
    }
  }

  const handleDeletePhotos = async () => {
    if (selectedPhotos.size === 0) return

    try {
      setDeletingPhotos(true)
      
      const photoIds = Array.from(selectedPhotos)
      const response = await fetch(`/api/admin/albums/${albumId}/photos/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          photoIds
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete photos")
      }

      const result = await response.json()
      
      toast({
        title: "Success",
        description: `Successfully deleted ${result.deletedCount} photo(s)`
      })

      // Refresh data
      await fetchAlbumAndPhotos()
      setSelectedPhotos(new Set())
      
    } catch (error) {
      console.error("Error deleting photos:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete photos",
        variant: "destructive"
      })
    } finally {
      setDeletingPhotos(false)
    }
  }

  const handleDownloadSelected = async () => {
    if (selectedPhotos.size === 0) return
    try {
      setDownloadingSelected(true)
      const photoIds = Array.from(selectedPhotos)
      const response = await fetch('/api/download/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'photos', photoIds })
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to start download')
      }
      const data = await response.json()
      const url = data?.url as string | undefined
      if (url) window.location.href = url
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to start download', variant: 'destructive' })
    } finally {
      setDownloadingSelected(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/albums">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </a>
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-lg h-64 animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!album) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/albums">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </a>
          </Button>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-medium mb-2">Album not found</h3>
            <p className="text-muted-foreground">The requested album could not be found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/albums">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Albums
            </a>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{album.name}</h1>
            <p className="text-muted-foreground">{album.path}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Badge variant={album.status === "PUBLIC" ? "default" : "secondary"}>
            {album.status}
          </Badge>
          {!album.enabled && (
            <Badge variant="destructive">Disabled</Badge>
          )}
        </div>
      </div>

      {/* Stats and Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{photos.length}</span>
                <span className="text-muted-foreground">total photos</span>
              </div>
              {selectedPhotos.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{selectedPhotos.size}</span>
                  <span className="text-muted-foreground">selected</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedPhotos.size > 0 && (
                <>
                  <Button variant="default" size="sm" onClick={handleDownloadSelected} disabled={downloadingSelected}>
                    <Download className="h-4 w-4 mr-2" />
                    {downloadingSelected ? 'Starting…' : `Download Selected (${selectedPhotos.size})`}
                  </Button>
                  {canDelete && <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={deletingPhotos}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedPhotos.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Photos</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {selectedPhotos.size} photo(s)?
                          <br />
                          <br />
                          <strong>This action will:</strong>
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Remove the photos from the database</li>
                            <li>Delete the files from local storage</li>
                            <li>Delete the files from remote storage (S3)</li>
                            <li>Remove all associated thumbnails</li>
                          </ul>
                          <br />
                          <strong className="text-destructive">This action cannot be undone.</strong>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeletePhotos}
                          className="bg-destructive hover:bg-destructive/90"
                          disabled={deletingPhotos}
                        >
                          {deletingPhotos ? "Deleting..." : "Delete Photos"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>}
                </>
              )}
              
              {canUpload && (
                <Button size="sm" onClick={() => setUploadModalOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photos
                </Button>
              )}

              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search photos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Photos Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Photos</CardTitle>
            {filteredPhotos.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedPhotos.size === filteredPhotos.length}
                  onCheckedChange={toggleSelectAll}
                />
                <label className="text-sm font-medium">
                  Select All ({filteredPhotos.length})
                </label>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Image className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {searchTerm ? "No photos found" : "No photos in this album"}
              </h3>
              <p className="text-muted-foreground text-center">
                {searchTerm 
                  ? "Try adjusting your search terms"
                  : "This album doesn't contain any photos yet."
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredPhotos.map((photo) => (
                <Card 
                  key={photo.id} 
                  className={`relative cursor-pointer transition-all hover:shadow-md ${
                    selectedPhotos.has(photo.id) ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  <CardContent className="p-0">
                    {/* Photo thumbnail */}
                    <div className="aspect-square bg-muted rounded-t-lg overflow-hidden">
                      <PhotoImage
                        photoId={photo.id}
                        filename={photo.filename}
                        size="small"
                        className="w-full h-full object-cover"
                        alt={photo.filename}
                      />
                    </div>
                    
                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={selectedPhotos.has(photo.id)}
                        onCheckedChange={() => togglePhotoSelection(photo.id)}
                        className="bg-background border-2"
                      />
                    </div>
                    
                    {/* Photo info */}
                    <div className="p-3">
                      <h4 className="font-medium text-sm truncate mb-1">
                        {photo.filename}
                      </h4>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          <span>{formatFileSize(photo.fileSize)}</span>
                        </div>
                        {photo.takenAt && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(photo.takenAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FileUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        albumId={albumId}
        albumName={album.name}
        onUploadComplete={() => {
          setUploadModalOpen(false)
          fetchAlbumAndPhotos()
        }}
      />
    </div>
  )
}
