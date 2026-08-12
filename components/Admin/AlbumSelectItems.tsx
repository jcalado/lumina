"use client"

import { Folder } from "lucide-react"
import { SelectItem } from "@/components/ui/select"

export type SelectableAlbum = {
  id: string
  name: string
  /** Filesystem-style path; its depth is what drives the indent. */
  path: string
}

/**
 * Album options for a <Select>, indented to show where each album sits in the
 * tree. Expects the list ordered by path, which puts every album directly
 * under its parent — the same order the tree itself uses.
 *
 * Names repeat across parents ("Lily" under two different years), so a flat
 * list of names cannot be told apart; the nesting is the distinguishing part.
 */
export function AlbumSelectItems({ albums }: { albums: SelectableAlbum[] }) {
  return (
    <>
      {albums.map((album) => {
        const depth = album.path.split("/").length - 1
        return (
          <SelectItem key={album.id} value={album.id}>
            <span
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${depth * 0.85}rem` }}
            >
              <Folder
                className={
                  depth === 0
                    ? "h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    : "h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                }
              />
              {album.name}
            </span>
          </SelectItem>
        )
      })}
    </>
  )
}
