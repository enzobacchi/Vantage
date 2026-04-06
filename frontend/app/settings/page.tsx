"use client"

import { useSearchParams, useRouter } from "next/navigation"

import { SettingsAuditLog } from "@/app/settings/settings-audit-log"
import { SettingsBilling } from "@/app/settings/settings-billing"
import { SettingsDonationOptions } from "@/app/settings/settings-donation-options"
import { SettingsEmailTemplates } from "@/app/settings/settings-email-templates"
import { SettingsIntegrations } from "@/app/settings/settings-integrations"
import { SettingsNotifications } from "@/app/settings/settings-notifications"
import { SettingsOrganization } from "@/app/settings/settings-organization"
import { SettingsProfile } from "@/app/settings/settings-profile"
import { SettingsTeam } from "@/app/settings/settings-team"
import { SettingsYearEndReceipts } from "@/app/settings/settings-year-end-receipts"
import { SettingsSidebarNav } from "@/app/settings/settings-sidebar-nav"
import { VALID_TABS, SETTINGS_NAV } from "@/app/settings/settings-nav-config"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab")
  const activeTab = tabParam && (VALID_TABS as readonly string[]).includes(tabParam) ? tabParam : "profile"

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    // Clear QB callback params when switching away from integrations
    if (value !== "integrations") {
      params.delete("qb")
      params.delete("realmId")
      params.delete("qb_error")
    }
    router.replace(`/settings?${params.toString()}`, { scroll: false })
  }

  // Find the current tab's label for the mobile select
  const activeLabel = SETTINGS_NAV
    .flatMap((g) => g.items)
    .find((i) => i.value === activeTab)?.label ?? "My Profile"

  return (
    <div className="flex gap-8">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0">
        <SettingsSidebarNav activeTab={activeTab} onTabChange={handleTabChange} />
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        {/* Mobile select dropdown */}
        <div className="mb-4 md:hidden">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full">
              <SelectValue>{activeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SETTINGS_NAV.map((group) => (
                <div key={group.label}>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeTab === "profile" && <SettingsProfile />}
        {activeTab === "organization" && <SettingsOrganization />}
        {activeTab === "team" && <SettingsTeam />}
        {activeTab === "integrations" && <SettingsIntegrations />}
        {activeTab === "donation-options" && <SettingsDonationOptions />}
        {activeTab === "email-templates" && <SettingsEmailTemplates />}
        {activeTab === "year-end" && <SettingsYearEndReceipts />}
        {activeTab === "notifications" && <SettingsNotifications />}
        {activeTab === "audit-log" && <SettingsAuditLog />}
        {activeTab === "billing" && <SettingsBilling />}
      </main>
    </div>
  )
}
