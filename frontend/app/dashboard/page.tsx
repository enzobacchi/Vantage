"use client"

import React, { useEffect, useState } from "react"

import { useNav } from "@/components/nav-context"
import { SettingsView } from "@/components/views/settings-view"
import { DashboardView } from "@/components/views/dashboard-view"
import { DonationsView } from "@/components/views/donations-view"
import { DonorCRMView } from "@/components/views/donor-crm-view"
import { DonorMapView } from "@/components/views/donor-map-view"
import { SavedReportsView } from "@/components/views/saved-reports-view"
import { TasksView } from "@/components/views/tasks-view"

const VIEWS = {
  dashboard: DashboardView,
  "donor-crm": DonorCRMView,
  donations: DonationsView,
  "donor-map": DonorMapView,
  "saved-reports": SavedReportsView,
  settings: SettingsView,
  tasks: TasksView,
} as const

type ViewKey = keyof typeof VIEWS

function MainContent() {
  const { activeView } = useNav()
  const [mounted, setMounted] = useState<Set<ViewKey>>(() => new Set([activeView as ViewKey]))

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeView as ViewKey)) return prev
      return new Set(prev).add(activeView as ViewKey)
    })
  }, [activeView])

  return (
    <>
      {(Object.entries(VIEWS) as [ViewKey, React.ComponentType][]).map(([key, View]) =>
        mounted.has(key) ? (
          <div key={key} style={{ display: activeView === key ? undefined : "none" }}>
            <View />
          </div>
        ) : null
      )}
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
