"use client"

import * as React from "react"
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  Minus,
} from "lucide-react"

import { formatCurrency } from "@/lib/format"
import { getScoreBgColor, getScoreColor } from "@/lib/donor-score"
import { cn } from "@/lib/utils"

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type HealthOutput = {
  donor_name?: string
  health_score: number
  label: string
  trend: "rising" | "declining" | "stable" | "new" | "inactive"
  suggested_ask?: number | null
  factors?: {
    recency: number
    frequency: number
    monetary: number
    engagement: number
    consistency: number
  }
  error?: string
}

function TrendIcon({ trend }: { trend: HealthOutput["trend"] }) {
  switch (trend) {
    case "rising":
      return <ArrowUpRight className="size-3.5 text-emerald-500" strokeWidth={1.5} />
    case "declining":
      return <ArrowDownRight className="size-3.5 text-red-500" strokeWidth={1.5} />
    case "stable":
      return <ArrowRight className="size-3.5 text-blue-500" strokeWidth={1.5} />
    default:
      return <Minus className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
  }
}

function trendLabel(trend: HealthOutput["trend"]) {
  switch (trend) {
    case "rising": return "Giving is growing"
    case "declining": return "Giving is declining"
    case "stable": return "Giving is steady"
    case "new": return "New donor"
    case "inactive": return "No recent activity"
  }
}

export function ChatHealthScoreCard({ part }: { part: ToolPart }) {
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "result"
  const output = part.output as HealthOutput | undefined

  if (!isDone || !output) {
    return (
      <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        <span>Scoring donor…</span>
      </div>
    )
  }

  if (output.error) {
    return (
      <div className="my-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {output.error}
      </div>
    )
  }

  const factorRows = output.factors
    ? [
        { label: "Recency", value: output.factors.recency, weight: 30 },
        { label: "Frequency", value: output.factors.frequency, weight: 25 },
        { label: "Monetary trend", value: output.factors.monetary, weight: 20 },
        { label: "Engagement", value: output.factors.engagement, weight: 15 },
        { label: "Consistency", value: output.factors.consistency, weight: 10 },
      ]
    : []

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex size-6 items-center justify-center rounded-md bg-teal-500/10">
          <Activity className="size-3.5 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1 text-xs font-medium truncate">
          Health score{output.donor_name ? ` · ${output.donor_name}` : ""}
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 py-3">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums",
            getScoreBgColor(output.health_score),
            getScoreColor(output.health_score)
          )}
        >
          {output.health_score}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{output.label}</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon trend={output.trend} />
            <span>{trendLabel(output.trend)}</span>
          </div>
          {output.suggested_ask != null && output.suggested_ask > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Suggested ask:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(output.suggested_ask)}
              </span>
            </div>
          )}
        </div>
      </div>

      {factorRows.length > 0 && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Factor contributions
          </div>
          {factorRows.map((row) => {
            const pct = Math.max(0, Math.min(row.weight, row.value))
            const widthPct = (pct / row.weight) * 100
            return (
              <div key={row.label} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">{row.label}</span>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-teal-500 dark:bg-teal-400"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(row.value)}/{row.weight}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
