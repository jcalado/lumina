"use client"

import { useMemo } from "react"
import { useTree } from "@headless-tree/react"
import { syncDataLoaderFeature, checkboxesFeature, hotkeysCoreFeature } from "@headless-tree/core"
import { ChevronDown, ChevronRight, Folder } from "lucide-react"
import { useTranslations } from "next-intl"

interface Album {
  id: string
  name: string
  path: string
}

interface AlbumTreeSelectProps {
  albums: Album[]
  selectedAlbumIds: string[]
  onSelectionChange: (albumIds: string[]) => void
}

type TreeItem = { name: string; path: string; children?: string[] }

export function AlbumTreeSelect({ albums, selectedAlbumIds, onSelectionChange }: AlbumTreeSelectProps) {
  const t = useTranslations("adminGroups")

  const { dataMap, allIds } = useMemo(() => {
    // Build parent-child relationships from paths
    // Sort by path so parents come before children
    const sorted = [...albums].sort((a, b) => a.path.localeCompare(b.path))

    // Map path -> album id for parent lookups
    const pathToId: Record<string, string> = {}
    for (const album of sorted) {
      pathToId[album.path] = album.id
    }

    const map: Record<string, TreeItem> = {}
    const topLevelIds: string[] = []
    const ids: string[] = []

    for (const album of sorted) {
      ids.push(album.id)

      // Find parent path (everything before the last "/")
      const lastSlash = album.path.lastIndexOf("/")
      const parentPath = lastSlash > 0 ? album.path.substring(0, lastSlash) : null
      const parentId = parentPath ? pathToId[parentPath] : null

      map[album.id] = { name: album.name, path: album.path }

      if (parentId && map[parentId]) {
        // Add as child of parent
        if (!map[parentId].children) {
          map[parentId].children = []
        }
        map[parentId].children!.push(album.id)
      } else {
        topLevelIds.push(album.id)
      }
    }

    // Add virtual root
    map["root"] = { name: "Root", path: "", children: topLevelIds }

    return { dataMap: map, allIds: ids }
  }, [albums])

  const tree = useTree<TreeItem>({
    rootItemId: "root",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => (item.getItemData().children?.length ?? 0) > 0,
    dataLoader: {
      getItem: (id) => dataMap[id],
      getChildren: (id) => dataMap[id]?.children ?? [],
    },
    state: {
      expandedItems: allIds,
      checkedItems: selectedAlbumIds,
    },
    setCheckedItems: (updater) => {
      if (typeof updater === "function") {
        onSelectionChange(updater(selectedAlbumIds))
      } else {
        onSelectionChange(updater)
      }
    },
    features: [syncDataLoaderFeature, checkboxesFeature, hotkeysCoreFeature],
  })

  return (
    <div>
      <div className="border rounded-md max-h-[300px] overflow-y-auto p-2" ref={tree.registerElement}>
        <div {...tree.getContainerProps()}>
          {tree.getItems().map((item) => (
            <div
              key={item.getId()}
              className="flex items-center gap-1.5 py-0.5"
              style={{ paddingLeft: `${item.getItemMeta().level * 20}px` }}
              {...item.getProps()}
            >
              {item.isFolder() ? (
                <button
                  type="button"
                  className="p-0.5 hover:bg-muted rounded shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    item.isExpanded() ? item.collapse() : item.expand()
                  }}
                >
                  {item.isExpanded() ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-[22px] shrink-0" />
              )}
              <input
                type="checkbox"
                className="shrink-0"
                {...item.getCheckboxProps()}
              />
              <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{item.getItemName()}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">
        {selectedAlbumIds.length > 0
          ? t("albumsSelected", { count: selectedAlbumIds.length })
          : t("noAlbumsSelected")}
      </p>
    </div>
  )
}
