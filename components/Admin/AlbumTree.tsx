"use client"

import React, { useMemo, useEffect } from "react"
import { useTree } from "@headless-tree/react"
import {
  syncDataLoaderFeature,
  dragAndDropFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
} from "@headless-tree/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Folder,
  Image,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Settings,
  ExternalLink,
  Plus,
} from "lucide-react"
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
  coverPhotoId: string | null
  createdAt: string
  displayOrder?: number
  _count: {
    photos: number
    videos: number
  }
}

type AlbumPerms = {
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canCreateSubalbums: boolean
}

interface AlbumTreeProps {
  albums: Album[]
  isFullAccess: boolean
  albumCan: (albumId: string, perm: keyof AlbumPerms) => boolean
  onEdit: (album: Album) => void
  onDelete: (album: Album) => void
  onCreate: (parentPath: string) => void
  onToggleStatus: (album: Album) => void
  onToggleFeatured: (album: Album) => void
  onReorder: (orderedIds: string[]) => void
  onMove: (albumId: string, newParentId: string | null, siblingOrder: string[]) => void
}

type TreeItemData = {
  album: Album
  children: string[]
}

export function AlbumTree({
  albums,
  isFullAccess,
  albumCan,
  onEdit,
  onDelete,
  onCreate,
  onToggleStatus,
  onToggleFeatured,
  onReorder,
  onMove,
}: AlbumTreeProps) {
  const t = useTranslations("adminAlbums")

  const { dataMap, recursiveCounts } = useMemo(() => {
    const sorted = [...albums].sort((a, b) => a.path.localeCompare(b.path))

    const pathToId: Record<string, string> = {}
    for (const album of sorted) {
      pathToId[album.path] = album.id
    }

    const map: Record<string, TreeItemData> = {}
    const topLevelIds: string[] = []

    for (const album of sorted) {
      map[album.id] = { album, children: [] }
    }

    for (const album of sorted) {
      const lastSlash = album.path.lastIndexOf("/")
      const parentPath = lastSlash > 0 ? album.path.substring(0, lastSlash) : null
      const parentId = parentPath ? pathToId[parentPath] : null

      if (parentId && map[parentId]) {
        map[parentId].children.push(album.id)
      } else {
        topLevelIds.push(album.id)
      }
    }

    const sortByOrder = (ids: string[]) =>
      ids.sort((a, b) => {
        const albumA = map[a].album
        const albumB = map[b].album
        const orderA = albumA.displayOrder ?? 0
        const orderB = albumB.displayOrder ?? 0
        if (orderA !== orderB) return orderA - orderB
        return albumA.name.localeCompare(albumB.name)
      })

    for (const item of Object.values(map)) {
      sortByOrder(item.children)
    }
    sortByOrder(topLevelIds)

    map["root"] = {
      album: {
        id: "root",
        name: "Root",
        path: "",
        slug: "",
        description: null,
        status: "PUBLIC",
        enabled: true,
        featured: false,
        coverPhotoId: null,
        createdAt: "",
        _count: { photos: 0, videos: 0 },
      },
      children: topLevelIds,
    }

    // Compute recursive media counts
    const counts: Record<string, { photos: number; videos: number }> = {}
    const computeCounts = (id: string): { photos: number; videos: number } => {
      if (counts[id]) return counts[id]
      const item = map[id]
      if (!item) return { photos: 0, videos: 0 }
      let photos = item.album._count?.photos || 0
      let videos = item.album._count?.videos || 0
      for (const childId of item.children) {
        const childCounts = computeCounts(childId)
        photos += childCounts.photos
        videos += childCounts.videos
      }
      counts[id] = { photos, videos }
      return counts[id]
    }
    for (const album of sorted) {
      computeCounts(album.id)
    }

    return { dataMap: map, recursiveCounts: counts }
  }, [albums])

  const tree = useTree<TreeItemData>({
    rootItemId: "root",
    getItemName: (item) => item.getItemData().album.name,
    // Treat every album as a folder so it can receive drops
    isItemFolder: () => true,
    dataLoader: {
      getItem: (id) => dataMap[id],
      getChildren: (id) => dataMap[id]?.children ?? [],
    },
    canReorder: true,
    canDrag: () => isFullAccess,
    canDrop: (items, target) => {
      const draggedId = items[0].getId()
      const targetItem = target.item

      // Can't drop album into itself
      if (targetItem.getId() === draggedId) return false

      // Can't drop album into its own descendants (would create a cycle)
      if (targetItem.isDescendentOf(draggedId)) return false

      return true
    },
    seperateDragHandle: true,
    indent: 24,
    onDrop: async (items, target) => {
      const draggedId = items[0].getId()
      const currentParentId = items[0].getParent()?.getId()

      if (isOrderedDragTarget(target)) {
        // Reorder / insert between siblings
        const newParent = target.item
        const currentChildren = newParent.getChildren().map((c) => c.getId())
        const filtered = currentChildren.filter((id) => id !== draggedId)
        filtered.splice(target.childIndex, 0, draggedId)

        if (currentParentId === newParent.getId()) {
          // Same parent — simple reorder
          onReorder(filtered)
        } else {
          // Different parent — move album
          const parentId = newParent.getId() === "root" ? null : newParent.getId()
          onMove(draggedId, parentId, filtered)
        }
      } else {
        // Unordered drop — dropping directly ON a folder
        const targetFolder = target.item
        const existingChildren = targetFolder
          .getChildren()
          .map((c) => c.getId())
          .filter((id) => id !== draggedId)
        const newOrder = [...existingChildren, draggedId]
        const parentId = targetFolder.getId() === "root" ? null : targetFolder.getId()
        onMove(draggedId, parentId, newOrder)
      }
    },
    features: [syncDataLoaderFeature, dragAndDropFeature, hotkeysCoreFeature],
  })

  // Rebuild tree when the underlying album data changes
  useEffect(() => {
    tree.rebuildTree()
  }, [dataMap, tree])

  return (
    <div className="relative" ref={tree.registerElement}>
      <div {...tree.getContainerProps("Album tree")}>
        {tree.getItems().map((item) => {
          const album = item.getItemData().album
          const level = item.getItemMeta().level
          const hasChildren = item.getChildren().length > 0
          const directCount =
            (album._count?.photos || 0) + (album._count?.videos || 0)
          const recursive = recursiveCounts[album.id] || {
            photos: 0,
            videos: 0,
          }
          const totalCount = recursive.photos + recursive.videos

          return (
            <div
              key={item.getId()}
              {...item.getProps()}
              className={cn(
                item.isDragTargetAbove() && "border-t-2 border-t-primary",
                item.isDragTargetBelow() && "border-b-2 border-b-primary",
                item.isUnorderedDragTarget() && "ring-2 ring-primary ring-inset rounded-sm",
              )}
            >
              <div
                className="grid grid-cols-12 gap-2 md:gap-4 py-3 px-3 border-b border-border/40 hover:bg-muted/30 transition-colors items-center text-sm"
                style={{ paddingLeft: `${level * 24 + 12}px` }}
              >
                {/* Album Name & Path */}
                <div className="col-span-5 md:col-span-4 flex items-center gap-2 min-w-0">
                  {isFullAccess ? (
                    <div {...item.getDragHandleProps()} className="shrink-0">
                      <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
                    </div>
                  ) : (
                    <div className="w-3 shrink-0" />
                  )}
                  {hasChildren ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-accent shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        item.isExpanded() ? item.collapse() : item.expand()
                      }}
                    >
                      {item.isExpanded() ? (
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
                    <div className="text-xs text-muted-foreground truncate">
                      {album.path}
                    </div>
                  </div>
                </div>

                {/* Media Count */}
                <div className="col-span-1 hidden md:flex items-center justify-center">
                  <div
                    className="flex items-center gap-1 text-muted-foreground"
                    title={
                      hasChildren && directCount !== totalCount
                        ? t("mediaDirect", {
                            direct: directCount,
                            total: totalCount,
                          })
                        : undefined
                    }
                  >
                    <Image className="h-3 w-3" />
                    <span className="font-medium text-foreground">
                      {totalCount}
                    </span>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="col-span-3 md:col-span-2 flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant={
                      album.status === "PUBLIC" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {album.status === "PUBLIC" ? t("public") : t("private")}
                  </Badge>
                  {!album.enabled && (
                    <Badge variant="destructive" className="text-xs">
                      Off
                    </Badge>
                  )}
                  {album.featured && (
                    <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">
                      {t("featuredToggle")}
                    </Badge>
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
                        onClick={() =>
                          window.open(
                            `/admin/albums/${album.id}/photos`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {t("browsePhotos")}
                      </DropdownMenuItem>
                      {albumCan(album.id, "canEdit") && (
                        <DropdownMenuItem onClick={() => onEdit(album)}>
                          <Settings className="h-4 w-4 mr-2" />
                          {t("editSettings")}
                        </DropdownMenuItem>
                      )}
                      {albumCan(album.id, "canCreateSubalbums") && (
                        <DropdownMenuItem
                          onClick={() => onCreate(album.path)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t("createSubAlbum")}
                        </DropdownMenuItem>
                      )}
                      {isFullAccess && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuCheckboxItem
                            checked={album.enabled}
                            onCheckedChange={() => onToggleStatus(album)}
                          >
                            {t("enabledToggle")}
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem
                            checked={album.featured}
                            onCheckedChange={() => onToggleFeatured(album)}
                          >
                            {t("featuredToggle")}
                          </DropdownMenuCheckboxItem>
                        </>
                      )}
                      {albumCan(album.id, "canDelete") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(album)}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
