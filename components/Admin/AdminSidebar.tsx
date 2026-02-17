"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import type { Session } from "next-auth"
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  BarChart3,
  Activity,
  FileText,
  Users,
  UsersRound,
  Camera,
  LogOut,
  ChevronsUpDown,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useTranslations } from "next-intl"

type NavItem = { key: string; href: string; icon: typeof LayoutDashboard; adminOnly?: boolean }

const allNavigationItems: NavItem[] = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "albums", href: "/admin/albums", icon: FolderOpen },
  { key: "groups", href: "/admin/groups", icon: UsersRound, adminOnly: true },
  { key: "jobs", href: "/admin/jobs", icon: Activity, adminOnly: true },
  { key: "logs", href: "/admin/logs", icon: FileText, adminOnly: true },
  { key: "analytics", href: "/admin/analytics", icon: BarChart3, adminOnly: true },
  { key: "users", href: "/admin/users", icon: Users, adminOnly: true },
  { key: "settings", href: "/admin/settings", icon: Settings, adminOnly: true },
]

function getInitials(email: string): string {
  const name = email.split("@")[0]
  return name.slice(0, 2).toUpperCase()
}

export default function AdminSidebar({ session }: { session: Session }) {
  const t = useTranslations("adminNav")
  const pathname = usePathname()
  const email = session.user?.email ?? ""
  const role = session.user?.role ?? ""
  const isAdminOrAbove = ["admin", "superadmin"].includes(role)

  const navigationItems = allNavigationItems.filter(
    (item) => !item.adminOnly || isAdminOrAbove
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Camera className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t("appName")}</span>
                  <span className="truncate text-xs text-muted-foreground">{t("appSubtitle")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href)
                const label = t(item.key as any)

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">
                      {getInitials(email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  <LogOut />
                  {t("logOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
