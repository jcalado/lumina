export const dynamic = 'force-dynamic';

import { getServerSession } from "next-auth"
import { connection } from "next/server"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminShell from "@/components/Admin/AdminShell"
import { ThemeCustomizer } from "@/components/ThemeCustomizer"
import { getSiteSettings } from "@/lib/settings"

interface AdminLayoutProps {
  children: React.ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getServerSession(authOptions)

  if (!session || !["admin", "superadmin", "member"].includes(session.user.role)) {
    redirect("/login")
  }

  await connection()
  const siteSettings = await getSiteSettings()

  return (
    <>
      <ThemeCustomizer accentColor={siteSettings.accentColor} />
      <AdminShell session={session}>{children}</AdminShell>
    </>
  )
}
