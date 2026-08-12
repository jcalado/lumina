"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useTranslations } from "next-intl"

export default function AdminHeader() {
  const t = useTranslations("adminNav")

  const staticLabels: Record<string, string> = {
    admin: t("dashboard"),
    albums: t("albums"),
    analytics: t("analytics"),
    groups: t("groups"),
    jobs: t("jobs"),
    logs: t("logs"),
    settings: t("settings"),
    users: t("users"),
    photos: t("photos"),
  }
  const pathname = usePathname()
  const [albumName, setAlbumName] = useState<string | null>(null)
  const [albumId, setAlbumId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)

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

  // Detect group ID from paths like /admin/groups/[id]
  useEffect(() => {
    const match = pathname.match(/^\/admin\/groups\/([^/]+)/)
    const id = match?.[1]
    if (id && id !== groupId) {
      setGroupId(id)
      setGroupName(null)
      fetch(`/api/admin/groups/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.group?.name) setGroupName(data.group.name)
        })
        .catch(() => {})
    } else if (!id) {
      setGroupId(null)
      setGroupName(null)
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
        crumbs.push({ label: t("breadcrumbHome"), href: "/admin" })
        continue
      }

      // If this segment is a dynamic album ID, link to its photos page
      if (i === 2 && segments[1] === "albums" && !staticLabels[segment]) {
        crumbs.push({ label: albumName || "...", href: href + "/photos" })
        continue
      }

      // If this segment is a dynamic group ID, resolve group name
      if (i === 2 && segments[1] === "groups" && !staticLabels[segment]) {
        crumbs.push({ label: groupName || "...", href })
        continue
      }

      crumbs.push({ label: staticLabels[segment] || segment, href })
    }

    // The album crumb already points at the photos page, so a trailing
    // "Photos" crumb repeats both the label's destination and its React key.
    return crumbs.filter(
      (crumb, i) => i === 0 || crumb.href !== crumbs[i - 1].href
    )
  }

  const crumbs = buildBreadcrumbs()

  // Detail pages (an album, a group) get a back control here rather than one
  // pushed into each page body. The trail already knows where "back" is.
  const parentCrumb = crumbs.length >= 3 ? crumbs[crumbs.length - 2] : null

  return (
    <header className="flex sticky top-0 z-50 h-14 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {parentCrumb && (
        <>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            {/* Icon only; the destination is right there in the trail. The
                label survives as the accessible name and the tooltip. */}
            <Link
              href={parentCrumb.href}
              aria-label={t("backTo", { label: parentCrumb.label })}
              title={t("backTo", { label: parentCrumb.label })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Separator orientation="vertical" className="mr-2 h-4" />
        </>
      )}
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <React.Fragment key={crumb.href}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
