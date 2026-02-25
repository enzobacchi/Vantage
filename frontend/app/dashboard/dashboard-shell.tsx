"use client"

import React, { Suspense } from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import {
  CommandMenu,
  CommandMenuProvider,
} from "@/components/command-menu"
import { NavProvider } from "@/components/nav-context"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useAutoSync } from "@/hooks/use-auto-sync"

function AutoSyncTrigger() {
  useAutoSync()
  return null
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <AutoSyncTrigger />
      <NavProvider>
        <SidebarProvider
          defaultOpen={false}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "3.5rem",
            } as React.CSSProperties
          }
        >
        <CommandMenuProvider>
          <AppSidebar variant="inset" />
          <SidebarInset className="bg-muted/20">
            <AppHeader />
            <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
              {children}
            </div>
          </SidebarInset>
          <CommandMenu />
        </CommandMenuProvider>
      </SidebarProvider>
    </NavProvider>
    </Suspense>
  )
}
