"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

interface AdminSidebarContextType {
  isMobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  isCollapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
}

const AdminSidebarContext = createContext<AdminSidebarContextType | null>(null)

export function AdminSidebarProvider({ children }: { children: ReactNode }) {
  const [isMobileOpen, setMobileOpen] = useState(false)
  const [isCollapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("admin-sidebar-collapsed")
    if (stored === "true") {
      setCollapsed(true)
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("admin-sidebar-collapsed", String(next))
      return next
    })
  }

  return (
    <AdminSidebarContext.Provider
      value={{ isMobileOpen, setMobileOpen, isCollapsed, setCollapsed, toggleCollapsed }}
    >
      {children}
    </AdminSidebarContext.Provider>
  )
}

export function useAdminSidebar() {
  const ctx = useContext(AdminSidebarContext)
  if (!ctx) {
    throw new Error("useAdminSidebar must be used within AdminSidebarProvider")
  }
  return ctx
}
