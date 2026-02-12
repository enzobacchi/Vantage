"use client"

import * as React from "react"
import { type Icon } from "@tabler/icons-react"

import { useNav, type NavView } from "@/components/nav-context"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: Icon
    view?: NavView
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { activeView, setActiveView } = useNav()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={item.view != null && activeView === item.view}
                onClick={item.view != null ? () => setActiveView(item.view!) : undefined}
                asChild={item.view == null}
              >
                {item.view != null ? (
                  <span className="flex items-center gap-2">
                    <item.icon />
                    <span>{item.title}</span>
                  </span>
                ) : (
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
