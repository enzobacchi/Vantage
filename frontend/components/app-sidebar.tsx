"use client"

import * as React from "react"
import {
  IconDashboard,
  IconFileText,
  IconMap,
  IconRoute2,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  useSidebar,
} from '@/components/ui/sidebar'

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
    title: "Route Planner",
    url: "/dashboard/routes",
    icon: IconRoute2,
  },
  {
    title: "Saved Reports",
    url: "#",
    icon: IconFileText,
    view: "saved-reports" as const,
  },
]

const navBottomData = [
  {
    title: "Settings",
    url: "/settings",
    icon: IconSettings,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpen: setSidebarOpen } = useSidebar()
  const collapseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    setSidebarOpen(true)
  }

  const handleMouseLeave = () => {
    collapseTimer.current = setTimeout(() => {
      setSidebarOpen(false)
    }, 250)
  }

  return (
    <Sidebar
      collapsible="icon"
      overlay
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <SidebarContent>
        <NavMain items={navMainData} bottomItems={navBottomData} />
      </SidebarContent>
    </Sidebar>
  )
}
