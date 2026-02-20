"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, ImageOff, Check } from "lucide-react"
import { useTranslations } from "next-intl"

interface PhotoItem {
  id: string
  filename: string
  takenAt: string | null
  thumbnailUrl: string | null
}

interface CoverPhotoPickerProps {
  isOpen: boolean
  onClose: () => void
  albumId: string
  currentCoverPhotoId: string | null
  onSelect: (photoId: string | null) => void
}

export function CoverPhotoPicker({
  isOpen,
  onClose,
  albumId,
  currentCoverPhotoId,
  onSelect,
}: CoverPhotoPickerProps) {
  const t = useTranslations("adminAlbums")
  const [photosByAlbum, setPhotosByAlbum] = useState<Record<string, PhotoItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(currentCoverPhotoId)

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentCoverPhotoId)
      fetchPhotos()
    }
  }, [isOpen, albumId])

  const fetchPhotos = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/albums/${albumId}/photos?includeDescendants=true`)
      if (res.ok) {
        const data = await res.json()
        setPhotosByAlbum(data.photosByAlbum || {})
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  const handleSave = () => {
    onSelect(selectedId)
    onClose()
  }

  const handleClear = () => {
    setSelectedId(null)
  }

  const totalPhotos = Object.values(photosByAlbum).reduce((sum, photos) => sum + photos.length, 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("selectCoverPhoto")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalPhotos === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ImageOff className="h-8 w-8 mb-2" />
            <p className="text-sm">{t("noPhotosFound")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {Object.entries(photosByAlbum).map(([albumName, photos]) => (
              <div key={albumName}>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  {t("photosFromAlbum", { album: albumName })}
                </h4>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {photos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring ${
                        selectedId === photo.id
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent"
                      }`}
                      onClick={() => setSelectedId(photo.id)}
                      title={photo.filename}
                    >
                      {photo.thumbnailUrl ? (
                        <img
                          src={photo.thumbnailUrl}
                          alt={photo.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {selectedId === photo.id && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="bg-primary rounded-full p-1">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={selectedId === null}
          >
            {t("clearCover")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave}>
              {t("saveCover")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
