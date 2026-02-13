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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export default function DashboardLayout({
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
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm">
              <SidebarTrigger className="-ml-1" aria-label="Toggle sidebar" />
              <Separator orientation="vertical" className="h-4" />
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
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
