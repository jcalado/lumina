import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type Permission = "can_upload" | "can_edit" | "can_delete" | "can_create_subalbums"

const permissionFieldMap: Record<Permission, string> = {
  can_upload: "canUpload",
  can_edit: "canEdit",
  can_delete: "canDelete",
  can_create_subalbums: "canCreateSubalbums",
}

function isAdminOrSuperadmin(role: string): boolean {
  return ["admin", "superadmin"].includes(role)
}

/**
 * Require the user to be authenticated (any role including member).
 * Returns the session if authorized, or a NextResponse error.
 */
export async function requireAuthenticated() {
  const session = await getServerSession(authOptions)

  if (!session || !["admin", "superadmin", "member"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Unauthorized - Authentication required" },
      { status: 401 }
    )
  }

  return session
}

/**
 * Check if a user has a specific permission on an album.
 * Admin/superadmin bypass all checks.
 * Members must have a group granting access to this album (or a parent) with the required permission.
 */
export async function requireAlbumAccess(albumId: string, permission: Permission) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // Admin/superadmin bypass
  if (isAdminOrSuperadmin(session.user.role)) {
    return session
  }

  // Member: check group permissions
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { path: true },
  })

  if (!album) {
    return NextResponse.json(
      { error: "Album not found" },
      { status: 404 }
    )
  }

  const userGroups = await prisma.userGroup.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        include: { albums: { include: { album: { select: { path: true } } } } },
      },
    },
  })

  const hasAccess = userGroups.some((ug) =>
    ug.group.albums.some((ga) => {
      const groupAlbumPath = ga.album.path
      const isPathMatch =
        album.path === groupAlbumPath ||
        album.path.startsWith(groupAlbumPath + "/")

      if (!isPathMatch) return false

      const field = permissionFieldMap[permission]
      return (ug.group as any)[field] === true
    })
  )

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Forbidden - Insufficient permissions" },
      { status: 403 }
    )
  }

  return session
}

/**
 * Check if a user has read access to an album (any group membership is sufficient).
 * Admin/superadmin bypass.
 */
export async function requireAlbumRead(albumId: string) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (isAdminOrSuperadmin(session.user.role)) {
    return session
  }

  const album = await prisma.album.findUnique({
    where: { id: albumId },
    select: { path: true },
  })

  if (!album) {
    return NextResponse.json(
      { error: "Album not found" },
      { status: 404 }
    )
  }

  const userGroups = await prisma.userGroup.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        include: { albums: { include: { album: { select: { path: true } } } } },
      },
    },
  })

  const hasAccess = userGroups.some((ug) =>
    ug.group.albums.some((ga) => {
      const groupAlbumPath = ga.album.path
      return (
        album.path === groupAlbumPath ||
        album.path.startsWith(groupAlbumPath + "/")
      )
    })
  )

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Forbidden - No access to this album" },
      { status: 403 }
    )
  }

  return session
}

/**
 * Get all album IDs a user can access.
 * Returns null for admin/superadmin (meaning all albums).
 * Returns string[] for members.
 */
export async function getAccessibleAlbumIds(userId: string, role: string): Promise<string[] | null> {
  if (isAdminOrSuperadmin(role)) {
    return null // all albums
  }

  const userGroups = await prisma.userGroup.findMany({
    where: { userId },
    include: {
      group: {
        include: { albums: { include: { album: { select: { id: true, path: true } } } } },
      },
    },
  })

  const groupPaths = userGroups.flatMap((ug) => ug.group.albums.map((ga) => ga.album.path))

  if (groupPaths.length === 0) {
    return []
  }

  // Find all albums that match any group path (exact or sub-path)
  const albums = await prisma.album.findMany({
    where: {
      OR: groupPaths.flatMap((path) => [
        { path: path },
        { path: { startsWith: path + "/" } },
      ]),
    },
    select: { id: true },
  })

  return albums.map((a) => a.id)
}

/**
 * Get effective permissions for a user on each album.
 * Returns null for admin/superadmin (full access).
 * Returns a map of albumId -> permissions for members.
 */
export async function getAlbumPermissions(
  userId: string,
  role: string
): Promise<Record<string, { canUpload: boolean; canEdit: boolean; canDelete: boolean; canCreateSubalbums: boolean }> | null> {
  if (isAdminOrSuperadmin(role)) {
    return null // full access
  }

  const userGroups = await prisma.userGroup.findMany({
    where: { userId },
    include: {
      group: {
        include: { albums: { include: { album: { select: { id: true, path: true } } } } },
      },
    },
  })

  if (userGroups.length === 0) {
    return {}
  }

  const groupPaths = userGroups.flatMap((ug) => ug.group.albums.map((ga) => ga.album.path))

  // Get all accessible albums
  const albums = await prisma.album.findMany({
    where: {
      OR: groupPaths.flatMap((path) => [
        { path: path },
        { path: { startsWith: path + "/" } },
      ]),
    },
    select: { id: true, path: true },
  })

  // Build permissions map (union of all matching groups)
  const permMap: Record<string, { canUpload: boolean; canEdit: boolean; canDelete: boolean; canCreateSubalbums: boolean }> = {}

  for (const album of albums) {
    permMap[album.id] = { canUpload: false, canEdit: false, canDelete: false, canCreateSubalbums: false }

    for (const ug of userGroups) {
      const hasMatchingAlbum = ug.group.albums.some((ga) => {
        const groupAlbumPath = ga.album.path
        return (
          album.path === groupAlbumPath ||
          album.path.startsWith(groupAlbumPath + "/")
        )
      })

      if (hasMatchingAlbum) {
        if (ug.group.canUpload) permMap[album.id].canUpload = true
        if (ug.group.canEdit) permMap[album.id].canEdit = true
        if (ug.group.canDelete) permMap[album.id].canDelete = true
        if (ug.group.canCreateSubalbums) permMap[album.id].canCreateSubalbums = true
      }
    }
  }

  return permMap
}
