"use client"

import type { Session } from "next-auth"
import { AdminSidebarProvider } from "./AdminSidebarContext"
import AdminHeader from "./AdminHeader"
import AdminSidebar from "./AdminSidebar"

interface AdminShellProps {
  session: Session
  children: React.ReactNode
}

export default function AdminShell({ session, children }: AdminShellProps) {
  return (
    <AdminSidebarProvider>
      <div className="min-h-screen bg-background">
        <AdminHeader session={session} />
        <div className="flex">
          <AdminSidebar />
          <main className="flex-1 p-4 md:p-6 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </AdminSidebarProvider>
  )
}
