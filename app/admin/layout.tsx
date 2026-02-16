export const dynamic = 'force-dynamic';

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminShell from "@/components/Admin/AdminShell"

interface AdminLayoutProps {
  children: React.ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getServerSession(authOptions)

  if (!session || !["admin", "superadmin"].includes(session.user.role)) {
    redirect("/login")
  }

  return <AdminShell session={session}>{children}</AdminShell>
}
