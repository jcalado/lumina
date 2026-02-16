"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAdminSidebar } from "./AdminSidebarContext"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  BarChart3,
  RefreshCw,
  Activity,
  FileText,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"

const navigationItems = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Albums", href: "/admin/albums", icon: FolderOpen },
  { name: "Jobs", href: "/admin/jobs", icon: Activity },
  { name: "Logs", href: "/admin/logs", icon: FileText },
  { name: "Sync", href: "/admin/sync", icon: RefreshCw },
  { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Settings", href: "/admin/settings", icon: Settings },
]

function SidebarNav({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="p-4 space-y-1">
      {navigationItems.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onLinkClick}
            className={cn(
              "flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
              isActive
                ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-full"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function CollapsedSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="p-2 space-y-1">
      {navigationItems.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href)
        const Icon = item.icon

        return (
          <Link
            key={item.name}
            href={item.href}
            title={item.name}
            className={cn(
              "flex items-center justify-center p-2 rounded-md transition-colors relative",
              isActive
                ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:bg-primary before:rounded-full"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        )
      })}
    </nav>
  )
}

export default function AdminSidebar() {
  const { isMobileOpen, setMobileOpen, isCollapsed, toggleCollapsed } = useAdminSidebar()

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:block bg-background border-r min-h-[calc(100vh-65px)] transition-all duration-200",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex flex-col h-full">
          {isCollapsed ? <CollapsedSidebarNav /> : <SidebarNav />}
          <div className="mt-auto p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              className="w-full flex items-center justify-center"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <VisuallyHidden>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden>
          <div className="pt-10">
            <SidebarNav onLinkClick={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
