"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

const NAV_VIEWS = ["dashboard", "donor-crm", "donor-map", "ai-agent", "saved-reports", "settings"] as const
type NavView = (typeof NAV_VIEWS)[number]

function isValidNavView(v: string | null): v is NavView {
  return v != null && NAV_VIEWS.includes(v as NavView)
}

interface NavContextType {
  activeView: NavView
  setActiveView: (view: NavView) => void
  selectedDonorId: string | null
  openDonor: (donorId: string) => void
  pendingAiQuery: string | null
  openAiWithQuery: (query: string) => void
  clearPendingAiQuery: () => void
}

const NavContext = React.createContext<NavContextType | undefined>(undefined)

export function NavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeView, setActiveViewState] = React.useState<NavView>("dashboard")

  const setActiveView = React.useCallback(
    (view: NavView) => {
      setActiveViewState(view)
      if (pathname === "/dashboard") {
        const params = new URLSearchParams(searchParams.toString())
        params.set("view", view)
        router.replace(`/dashboard?${params.toString()}`, { scroll: false })
      }
    },
    [pathname, searchParams, router]
  )

  React.useEffect(() => {
    if (pathname !== "/dashboard") return
    const viewParam = searchParams.get("view")
    if (isValidNavView(viewParam)) {
      setActiveViewState(viewParam)
    }
  }, [pathname, searchParams])

  const [selectedDonorId, setSelectedDonorId] = React.useState<string | null>(null)
  const [pendingAiQuery, setPendingAiQuery] = React.useState<string | null>(null)

  const openDonor = React.useCallback(
    (donorId: string) => {
      setSelectedDonorId(donorId)
      setActiveViewState("donor-crm")
      if (pathname === "/dashboard") {
        router.replace("/dashboard?view=donor-crm", { scroll: false })
      }
    },
    [pathname, router]
  )

  const openAiWithQuery = React.useCallback(
    (query: string) => {
      setPendingAiQuery(query)
      setActiveViewState("ai-agent")
      if (pathname === "/dashboard") {
        router.replace("/dashboard?view=ai-agent", { scroll: false })
      }
    },
    [pathname, router]
  )

  const clearPendingAiQuery = React.useCallback(() => {
    setPendingAiQuery(null)
  }, [])

  return (
    <NavContext.Provider
      value={{
        activeView,
        setActiveView,
        selectedDonorId,
        openDonor,
        pendingAiQuery,
        openAiWithQuery,
        clearPendingAiQuery,
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

export function useNav() {
  const context = React.useContext(NavContext)
  if (context === undefined) {
    throw new Error("useNav must be used within a NavProvider")
  }
  return context
}

export type { NavView }
