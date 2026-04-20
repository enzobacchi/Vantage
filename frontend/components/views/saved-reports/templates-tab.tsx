"use client"

import * as React from "react"
import { Repeat, UserPlus, RefreshCw, MapPinned } from "lucide-react"

import { TemplateCard, type TemplateMeta } from "./template-card"

const TEMPLATES: TemplateMeta[] = [
  {
    key: "retention",
    title: "Retention rate",
    description: "% of donors who gave in the previous period and gave again in the current period.",
    icon: Repeat,
  },
  {
    key: "acquisition",
    title: "Acquisition rate",
    description: "% of donors in the current period who are first-time givers.",
    icon: UserPlus,
  },
  {
    key: "recapture",
    title: "Recapture",
    description: "Donors who gave 3–5 years ago, did not give last year, and gave again this period.",
    icon: RefreshCw,
  },
  {
    key: "new-leads-by-source",
    title: "New leads by source",
    description: "New donors in the current period, grouped by acquisition source.",
    icon: MapPinned,
  },
]

export function TemplatesSection({ onSavedReport }: { onSavedReport?: () => void }) {
  const [fyStartMonth, setFyStartMonth] = React.useState<number>(1)

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/organization", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return
        const m = Number(json?.fiscal_year_start_month)
        if (Number.isInteger(m) && m >= 1 && m <= 12) setFyStartMonth(m)
      })
      .catch(() => {
        /* default to Jan 1 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Report Templates</h2>
        <p className="text-sm text-muted-foreground">
          Industry-standard nonprofit metrics, computed from your data.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
        {TEMPLATES.map((meta) => (
          <TemplateCard
            key={meta.key}
            meta={meta}
            fiscalYearStartMonth={fyStartMonth}
            onSavedReport={onSavedReport}
          />
        ))}
      </div>
    </section>
  )
}

// Backwards compat: previous import name
export { TemplatesSection as TemplatesTab }
