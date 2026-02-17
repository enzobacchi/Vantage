"use client"

import React, { Suspense } from "react"

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
      <NavProvider>
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "3rem",
            } as React.CSSProperties
          }
        >
        <CommandMenuProvider>
          <AppSidebar variant="inset" />
          <SidebarInset className="bg-muted/20">
            <header className="flex h-12 shrink-0 items-center border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm"></header>
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
