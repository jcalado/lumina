"use client"

import type { Session } from "next-auth"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import AdminSidebar from "./AdminSidebar"
import AdminHeader from "./AdminHeader"

export default function AdminShell({ session, children }: { session: Session; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar session={session} />
      <SidebarInset>
        <AdminHeader />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
