"use client"

import { IconMap, IconSparkles } from "@tabler/icons-react"

import { useNav } from '@/components/nav-context'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

const viewTitles: Record<string, string> = {
  dashboard: "Dashboard",
  "donor-crm": "Donor CRM",
  "donor-map": "Donor Map",
  "ai-agent": "AI Agent",
  "saved-reports": "Saved Reports",
  settings: "Settings",
}

export function SiteHeader() {
  const { activeView, setActiveView } = useNav()
  const title = viewTitles[activeView] || "Donor Intelligence"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden bg-transparent sm:flex"
            onClick={() => setActiveView("donor-map")}
          >
            <IconMap className="size-4" />
            View Map
          </Button>
          <Button
            size="sm"
            className="hidden sm:flex"
            onClick={() => setActiveView("ai-agent")}
          >
            <IconSparkles className="size-4" />
            Ask AI
          </Button>
        </div>
      </div>
    </header>
  )
}
