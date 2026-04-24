"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { formatCurrency } from "@/lib/format"
import { getScoreBgColor, getScoreColor } from "@/lib/donor-score"
import { cn } from "@/lib/utils"

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type AtRiskDonor = {
  donor_id: string
  donor_name: string | null
  health_score: number
  label: string
  trend: "rising" | "declining" | "stable" | "new" | "inactive"
  lifetime_value: number
  last_donation_date: string | null
  suggested_ask?: number | null
}

type AtRiskOutput = {
  at_risk_donors: AtRiskDonor[]
  total_found: number
  error?: string
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return null
  const ms = Date.now() - then.getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function ChatAtRiskCard({
  part,
  onDonorClick,
}: {
  part: ToolPart
  onDonorClick?: (donorId: string) => void
}) {
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "result"
  const output = part.output as AtRiskOutput | undefined

  if (!isDone || !output) {
    return (
      <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        <span>Finding at-risk donors…</span>
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

  const donors = output.at_risk_donors ?? []

  if (donors.length === 0) {
    return (
      <div className="my-2 rounded-xl border border-border/60 bg-card px-3 py-3 text-xs text-muted-foreground">
        No at-risk donors right now. Retention is healthy.
      </div>
    )
  }

  const remaining = Math.max(0, output.total_found - donors.length)

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/10">
          <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1 text-xs font-medium">At-risk donors</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {output.total_found} found
        </div>
      </div>

      <ul>
        {donors.map((d, idx) => {
          const days = daysSince(d.last_donation_date)
          return (
            <li
              key={d.donor_id}
              className={cn(
                "px-3 py-2 flex items-center gap-3",
                idx !== donors.length - 1 && "border-b border-border/40"
              )}
            >
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  getScoreBgColor(d.health_score),
                  getScoreColor(d.health_score)
                )}
              >
                {d.health_score}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onDonorClick?.(d.donor_id)}
                  className="block truncate text-left text-sm font-medium hover:underline underline-offset-2"
                >
                  {d.donor_name ?? "Unknown donor"}
                </button>
                <div className="text-[11px] text-muted-foreground">
                  {formatCurrency(d.lifetime_value)} lifetime
                  {days != null && <> · last gift {days}d ago</>}
                </div>
              </div>
              {d.suggested_ask != null && d.suggested_ask > 0 && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Ask
                  </div>
                  <div className="text-xs font-medium tabular-nums">
                    {formatCurrency(d.suggested_ask)}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {remaining > 0 && (
        <div className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          +{remaining} more
        </div>
      )}
    </div>
  )
}
