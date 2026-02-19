"use client"

import React, { useEffect } from "react"

import { useNav } from "@/components/nav-context"
import { SettingsView } from "@/components/views/settings-view"
import { DashboardView } from "@/components/views/dashboard-view"
import { DonorCRMView } from "@/components/views/donor-crm-view"
import { DonorMapView } from "@/components/views/donor-map-view"
import { SavedReportsView } from "@/components/views/saved-reports-view"

function MainContent() {
  const { activeView } = useNav()

  return (
    <>
      {activeView === "dashboard" && <DashboardView />}
      {activeView === "donor-crm" && <DonorCRMView />}
      {activeView === "donor-map" && <DonorMapView />}
      {activeView === "saved-reports" && <SavedReportsView />}
      {activeView === "settings" && <SettingsView />}
    </>
  )
}

export default function Page() {
  // If user signed in after "Sign in with QuickBooks", link the pending org once
  useEffect(() => {
    fetch("/api/auth/link-pending-org", { method: "POST", credentials: "include" }).catch(() => {})
  }, [])

  return <MainContent />
}
