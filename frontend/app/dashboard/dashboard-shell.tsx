"use client"

import React from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatBar } from "@/components/chat/chat-bar"
import { ChatOverlay } from "@/components/chat/chat-overlay"
import { ChatProvider } from "@/components/chat/chat-provider"
import {
  CommandMenu,
  CommandMenuProvider,
} from "@/components/command-menu"
import { DonorPopupProvider } from "@/components/donors/donor-popup"
import { NavProvider } from "@/components/nav-context"
import { OnboardingWizard } from "@/components/onboarding-wizard"
import { TosAcceptanceDialog } from "@/components/tos-acceptance-dialog"
import { StripeCheckoutLinker } from "@/components/stripe-checkout-linker"
import { UsageAlertBanner } from "@/components/usage-alert-banner"
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
  tosAccepted = true,
  onboardingDone = true,
}: {
  children: React.ReactNode
  tosAccepted?: boolean
  onboardingDone?: boolean
}) {
  return (
    <>
      <AutoSyncTrigger />
      <StripeCheckoutLinker />
      <TosAcceptanceDialog open={!tosAccepted} />
      {/* Show onboarding only after TOS is accepted */}
      {tosAccepted && <OnboardingWizard open={!onboardingDone} />}
      <NavProvider>
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "16rem",
              "--sidebar-width-icon": "3.5rem",
            } as React.CSSProperties
          }
        >
        <CommandMenuProvider>
        <ChatProvider>
        <DonorPopupProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader />
            <UsageAlertBanner />
            <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
              {children}
            </div>
          </SidebarInset>
          <ChatBar />
          <ChatOverlay />
          <CommandMenu />
        </DonorPopupProvider>
        </ChatProvider>
        </CommandMenuProvider>
      </SidebarProvider>
    </NavProvider>
    </>
  )
}
