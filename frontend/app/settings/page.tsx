"use client"

import * as React from "react"
import {
  IconBuilding,
  IconCreditCard,
  IconLink,
  IconUser,
  IconUsers,
} from "@tabler/icons-react"

import { SettingsNav } from "@/components/settings-nav"
import { SettingsIntegrations } from "@/app/settings/settings-integrations"
import { SettingsOrganization } from "@/app/settings/settings-organization"
import { SettingsProfile } from "@/app/settings/settings-profile"
import { SettingsTeam } from "@/app/settings/settings-team"

const SIDEBAR_ITEMS = [
  { id: "profile", label: "My Profile", icon: IconUser },
  { id: "organization", label: "Organization", icon: IconBuilding },
  { id: "team", label: "Team", icon: IconUsers },
  { id: "integrations", label: "Integrations", icon: IconLink },
  { id: "billing", label: "Billing", icon: IconCreditCard },
] as const satisfies readonly { id: string; label: string; icon: typeof IconUser }[]

type SectionId = (typeof SIDEBAR_ITEMS)[number]["id"]

export default function SettingsPage() {
  const [section, setSection] = React.useState<SectionId>("profile")

  return (
    <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
      <aside className="lg:w-1/5">
        <SettingsNav
          items={SIDEBAR_ITEMS}
          value={section}
          onValueChange={(id) => setSection(id as SectionId)}
        />
      </aside>
      <main className="min-w-0 flex-1 lg:max-w-2xl">
        {section === "profile" && <SettingsProfile />}
        {section === "organization" && <SettingsOrganization />}
        {section === "team" && <SettingsTeam />}
        {section === "integrations" && <SettingsIntegrations />}
        {section === "billing" && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
            <IconCreditCard className="mx-auto size-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">Billing</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage your subscription and payment methods. Coming soon.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
