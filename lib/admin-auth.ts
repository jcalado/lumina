import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function requireAdmin() {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 401 }
    )
  }
  
  return session
}

export async function isAdmin() {
  const session = await getServerSession(authOptions)
  return session?.user.role === "admin"
}
