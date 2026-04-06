"use client"

import * as React from "react"
import { Settings2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  getDashboardPreferences,
  updateDashboardPreferences,
  type DashboardPreferences,
} from "@/app/actions/dashboard-preferences"

const DEFAULT_PREFS: DashboardPreferences = {
  show_metric_cards: true,
  show_smart_actions: true,
  show_donations_chart: true,
  show_recent_gifts: true,
  show_top_donors: true,
}

const WIDGETS = [
  { key: "show_metric_cards" as const, label: "Metric Cards" },
  { key: "show_smart_actions" as const, label: "Daily Insights" },
  { key: "show_donations_chart" as const, label: "Giving Chart" },
  { key: "show_recent_gifts" as const, label: "Recent Gifts" },
  { key: "show_top_donors" as const, label: "Top Donors" },
]

const STORAGE_KEY = "vantage-dashboard-prefs"

function loadLocalPrefs(): DashboardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function saveLocalPrefs(prefs: DashboardPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {}
}

export function DashboardCustomize({
  onPrefsChange,
}: {
  onPrefsChange: (prefs: DashboardPreferences) => void
}) {
  const [prefs, setPrefs] = React.useState<DashboardPreferences>(DEFAULT_PREFS)
  const dbAvailable = React.useRef(false)

  React.useEffect(() => {
    // Try database first, fall back to localStorage
    getDashboardPreferences()
      .then((p) => {
        dbAvailable.current = true
        setPrefs(p)
        onPrefsChange(p)
      })
      .catch(() => {
        // DB table may not exist yet — use localStorage
        const local = loadLocalPrefs()
        setPrefs(local)
        onPrefsChange(local)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(key: keyof DashboardPreferences) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    onPrefsChange(next)

    // Always save to localStorage as a backup
    saveLocalPrefs(next)

    if (dbAvailable.current) {
      try {
        await updateDashboardPreferences({ [key]: next[key] })
      } catch {
        // DB save failed — localStorage backup already saved
      }
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Settings2 className="size-4" strokeWidth={1.5} />
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="end">
        <p className="text-xs font-medium text-muted-foreground mb-2">Show widgets</p>
        <div className="space-y-2.5">
          {WIDGETS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={key} className="text-sm cursor-pointer">
                {label}
              </Label>
              <Switch
                id={key}
                checked={prefs[key]}
                onCheckedChange={() => toggle(key)}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
