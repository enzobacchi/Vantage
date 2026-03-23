"use client"

import * as React from "react"
import { AlertTriangle, AlertCircle, X, ArrowRight } from "lucide-react"
import Link from "next/link"

type UsageAlert = {
  type: "warning" | "critical"
  message: string
}

export function UsageAlertBanner() {
  const [alerts, setAlerts] = React.useState<UsageAlert[]>([])
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch("/api/stripe/status")
        if (!res.ok) return
        const data = await res.json()
        const { limits, usage } = data
        const found: UsageAlert[] = []

        // Donor limit alerts
        if (limits.maxDonors > 0) {
          const pct = Math.round((usage.donors / limits.maxDonors) * 100)
          if (pct >= 100) {
            found.push({
              type: "critical",
              message: `Donor limit reached (${usage.donors.toLocaleString()}/${limits.maxDonors.toLocaleString()}). Upgrade to add more donors.`,
            })
          } else if (pct >= 80) {
            found.push({
              type: "warning",
              message: `You're at ${pct}% of your donor limit.`,
            })
          }
        }

        // AI insight alerts
        if (limits.maxAiInsightsPerMonth > 0) {
          const pct = Math.round((usage.aiInsights / limits.maxAiInsightsPerMonth) * 100)
          if (pct >= 100) {
            found.push({
              type: "critical",
              message: `AI insights used up for this month (${usage.aiInsights}/${limits.maxAiInsightsPerMonth}). Upgrade for more.`,
            })
          } else if (pct >= 80) {
            found.push({
              type: "warning",
              message: `${usage.aiInsights} of ${limits.maxAiInsightsPerMonth} AI insights used this month.`,
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

  if (dismissed || alerts.length === 0) return null

  // Show the most critical alert
  const alert = alerts.find((a) => a.type === "critical") ?? alerts[0]

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
        onClick={() => setDismissed(true)}
        className="ml-1 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )
}
