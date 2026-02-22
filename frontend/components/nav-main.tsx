"use client"

import type { Icon } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { useNav, type NavView } from "@/components/nav-context"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: Icon
    view?: NavView
  }[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { activeView, setActiveView } = useNav()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isExternalLink = item.view == null
            const href = isExternalLink
              ? item.url
              : item.view === "dashboard"
                ? "/dashboard"
                : `/dashboard?view=${item.view}`
            const viewParam = searchParams.get("view")
            const isActive = isExternalLink
              ? pathname === item.url
              : pathname === "/dashboard" &&
                (item.view
                  ? viewParam === item.view || (item.view === "dashboard" && !viewParam)
                  : false)

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isActive}
                  asChild
                >
                  <Link
                    href={href}
                    onClick={() => !isExternalLink && item.view && setActiveView(item.view)}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
