"use client"

import { cn } from "@/lib/utils"
import { SETTINGS_NAV } from "./settings-nav-config"

type SettingsSidebarNavProps = {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function SettingsSidebarNav({ activeTab, onTabChange }: SettingsSidebarNavProps) {
  return (
    <nav className="flex flex-col gap-6">
      {SETTINGS_NAV.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.value
              return (
                <button
                  key={item.value}
                  onClick={() => onTabChange(item.value)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
