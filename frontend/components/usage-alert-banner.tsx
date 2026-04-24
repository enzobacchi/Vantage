"use client"

import * as React from "react"
import { AlertTriangle, AlertCircle, X, ArrowRight } from "lucide-react"
import Link from "next/link"

type UsageAlert = {
  type: "warning" | "critical"
  message: string
  // Stable key used to persist dismissal. Includes the metric + bucket so that
  // a new, larger threshold will re-surface the banner even if the user
  // previously dismissed a warning at a lower bucket.
  key: string
}

const STORAGE_PREFIX = "vantage.usage_banner_dismissed:"

// Pct → nearest 10% bucket floor. 82 → 80, 91 → 90, 100 → 100.
function bucketFor(pct: number) {
  return Math.min(100, Math.floor(pct / 10) * 10)
}

function isDismissed(key: string) {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === "1"
  } catch {
    return false
  }
}

function markDismissed(key: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, "1")
  } catch {
    // localStorage may be unavailable (Safari private mode, etc.)
  }
}

export function UsageAlertBanner() {
  const [alerts, setAlerts] = React.useState<UsageAlert[]>([])
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/stripe/status")
        if (!res.ok) return
        const data = await res.json()
        const { limits, usage } = data
        const found: UsageAlert[] = []

        if (limits.maxDonors > 0) {
          const pct = Math.round((usage.donors / limits.maxDonors) * 100)
          if (pct >= 100) {
            found.push({
              type: "critical",
              message: `Donor limit reached (${usage.donors.toLocaleString()}/${limits.maxDonors.toLocaleString()}). Upgrade to add more donors.`,
              key: `donors:${bucketFor(pct)}`,
            })
          } else if (pct >= 80) {
            found.push({
              type: "warning",
              message: `You're at ${pct}% of your donor limit.`,
              key: `donors:${bucketFor(pct)}`,
            })
          }
        }

        if (limits.maxAiInsightsPerMonth > 0) {
          const pct = Math.round((usage.aiInsights / limits.maxAiInsightsPerMonth) * 100)
          if (pct >= 100) {
            found.push({
              type: "critical",
              message: `AI insights used up for this month (${usage.aiInsights}/${limits.maxAiInsightsPerMonth}). Upgrade for more.`,
              key: `aiInsights:${bucketFor(pct)}`,
            })
          } else if (pct >= 80) {
            found.push({
              type: "warning",
              message: `${usage.aiInsights} of ${limits.maxAiInsightsPerMonth} AI insights used this month.`,
              key: `aiInsights:${bucketFor(pct)}`,
            })
          }
        }

        if (!cancelled) setAlerts(found)
      } catch {
        // Silently ignore — billing status not critical for rendering
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const alert = React.useMemo(() => {
    if (alerts.length === 0) return null
    return alerts.find((a) => a.type === "critical") ?? alerts[0]
  }, [alerts])

  // If the persisted dismissal matches the current alert's key, hide it. When
  // usage crosses into a new 10% bucket, the key changes and the banner
  // reappears.
  const hideFromStorage = alert ? isDismissed(alert.key) : false
  const hideFromSession = alert ? dismissedKey === alert.key : false

  if (!alert || hideFromStorage || hideFromSession) return null

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-sm ${
        alert.type === "critical"
          ? "bg-destructive/10 text-destructive dark:bg-destructive/20"
          : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
      }`}
    >
      {alert.type === "critical" ? (
        <AlertCircle className="size-4 shrink-0" strokeWidth={1.5} />
      ) : (
        <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} />
      )}
      <span className="flex-1">{alert.message}</span>
      <Link
        href="/settings?tab=billing"
        className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline whitespace-nowrap"
      >
        View plans <ArrowRight className="size-3.5" strokeWidth={1.5} />
      </Link>
      <button
        onClick={() => {
          markDismissed(alert.key)
          setDismissedKey(alert.key)
        }}
        className="ml-1 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )
}
