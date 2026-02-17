"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const staticLabels: Record<string, string> = {
  admin: "Home",
  albums: "Albums",
  analytics: "Analytics",
  jobs: "Jobs",
  logs: "Logs",
  settings: "Settings",
  users: "Users",
  photos: "Photos",
}

export default function AdminHeader() {
  const pathname = usePathname()
  const [albumName, setAlbumName] = useState<string | null>(null)
  const [albumId, setAlbumId] = useState<string | null>(null)

  // Detect album ID from paths like /admin/albums/[id]/photos
  useEffect(() => {
    const match = pathname.match(/^\/admin\/albums\/([^/]+)/)
    const id = match?.[1]
    if (id && id !== albumId) {
      setAlbumId(id)
      setAlbumName(null)
      fetch(`/api/admin/albums/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.album?.name) setAlbumName(data.album.name)
        })
        .catch(() => {})
    } else if (!id) {
      setAlbumId(null)
      setAlbumName(null)
    }
  }, [pathname])

  const buildBreadcrumbs = () => {
    const segments = pathname.replace(/\/$/, "").split("/").filter(Boolean)
    // segments: ["admin"] or ["admin", "albums"] or ["admin", "albums", "<id>", "photos"]

    const crumbs: { label: string; href: string }[] = []

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const href = "/" + segments.slice(0, i + 1).join("/")

      // Skip "admin" as first crumb — it's always there as the root
      if (i === 0 && segment === "admin") {
        crumbs.push({ label: "Lumina Admin", href: "/admin" })
        continue
      }

      // If this segment is a dynamic album ID, link to its photos page
      if (i === 2 && segments[1] === "albums" && !staticLabels[segment]) {
        crumbs.push({ label: albumName || "...", href: href + "/photos" })
        continue
      }

      crumbs.push({ label: staticLabels[segment] || segment, href })
    }

    return crumbs
  }

  const crumbs = buildBreadcrumbs()

  return (
    <header className="flex sticky top-0 z-50 h-14 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <BreadcrumbItem key={crumb.href}>
                {i > 0 && <BreadcrumbSeparator />}
                {isLast ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
