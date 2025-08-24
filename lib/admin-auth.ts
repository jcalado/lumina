import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function requireAdmin() {
  const session = await getServerSession(authOptions)
  
  if (!session || !["admin", "superadmin"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    )
  }
  
  return session
}

export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Unauthorized - Superadmin access required" },
      { status: 401 }
    )
  }
  
  return session
}

export async function isAdmin() {
  const session = await getServerSession(authOptions)
  return session && ["admin", "superadmin"].includes(session.user.role)
}

export async function isSuperAdmin() {
  const session = await getServerSession(authOptions)
  return session?.user.role === "superadmin"
}
