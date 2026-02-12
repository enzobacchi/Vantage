"use client"

import * as React from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconDashboard,
  IconFileText,
  IconLayoutDashboard,
  IconMap,
  IconRoute2,
  IconSearch,
  IconSettings,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react"

import { useCommandMenu } from "@/components/command-menu"
import { useAuthUser } from "@/hooks/use-auth-user"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from "@/components/ui/button"

const navMainData = [
  {
    title: "Dashboard",
    url: "#",
    icon: IconDashboard,
    view: "dashboard" as const,
  },
  {
    title: "Donor CRM",
    url: "#",
    icon: IconUsers,
    view: "donor-crm" as const,
  },
  {
    title: "Donor Map",
    url: "#",
    icon: IconMap,
    view: "donor-map" as const,
  },
  {
    title: "Route Planner (Beta)",
    url: "/dashboard/routes",
    icon: IconRoute2,
  },
  // Pilot: Pipeline hidden until ready
  // {
  //   title: "Pipeline",
  //   url: "/dashboard/pipeline",
  //   icon: IconTrendingUp,
  // },
  {
    title: "Saved Reports",
    url: "#",
    icon: IconFileText,
    view: "saved-reports" as const,
  },
  {
    title: "Settings",
    url: "#",
    icon: IconSettings,
    view: "settings" as const,
  },
]

function SidebarFooterToggle() {
  const { state, toggleSidebar, isMobile } = useSidebar()
  if (isMobile) return null
  const isCollapsed = state === "collapsed"
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground mt-2 size-8 shrink-0"
      onClick={toggleSidebar}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {isCollapsed ? (
        <IconChevronRight className="size-4" />
      ) : (
        <IconChevronLeft className="size-4" />
      )}
    </Button>
  )
}

const fallbackUser = {
  name: "User",
  email: "",
  avatar: "",
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpen } = useCommandMenu()
  const { user: authUser, loading } = useAuthUser()
  const sidebarUser = loading
    ? { ...fallbackUser, name: "Loading…", email: "" }
    : authUser ?? fallbackUser

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Vantage"
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/dashboard">
                <IconLayoutDashboard className="size-5 shrink-0 text-slate-900 dark:text-white" />
                <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Vantage</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
          <Button
            variant="outline"
            className="bg-muted/30 text-muted-foreground hover:bg-muted/50 h-9 w-full justify-start rounded-md border border-border/60 text-sm font-normal shadow-none"
            onClick={() => setOpen(true)}
          >
            <IconSearch className="mr-2 size-4 shrink-0" />
            <span className="inline-flex truncate">Search...</span>
            <kbd className="bg-muted pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMainData} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-1 px-2 group-data-[collapsible=icon]:justify-center">
          <ThemeToggle />
          <SidebarFooterToggle />
        </div>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
