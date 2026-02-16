export const dynamic = 'force-dynamic';

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminSidebar from "@/components/Admin/AdminSidebar"
import AdminHeader from "@/components/Admin/AdminHeader"

interface AdminLayoutProps {
  children: React.ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getServerSession(authOptions)

  if (!session || !["admin", "superadmin"].includes(session.user.role)) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader session={session} />
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
