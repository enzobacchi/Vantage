"use client"

import * as React from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  GitCompareArrows,
  Loader2,
  Minus,
} from "lucide-react"

import { formatCurrency } from "@/lib/format"

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type PeriodStat = {
  label: string
  from: string
  to: string
  total_revenue: number
  gift_count: number
  donor_count: number
  average_gift: number
}

type CompareOutput = {
  a: PeriodStat
  b: PeriodStat
  delta: {
    total_revenue_pct: number | null
    gift_count_pct: number | null
    donor_count_pct: number | null
    average_gift_pct: number | null
    total_revenue_abs: number
  }
  group_by?: string
  by_group?: Array<{
    group: string
    a: number
    b: number
    delta_pct: number | null
  }>
  retention?: {
    retained_donors: number
    new_donors_in_b: number
    lost_donors: number
    retention_rate_pct: number | null
  }
}

export function ChatCompareCard({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = React.useState(false)
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "result"
  const output = part.output as CompareOutput | undefined

  if (!isDone || !output) {
    return (
      <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        <span>Comparing periods…</span>
      </div>
    )
  }

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex size-6 items-center justify-center rounded-md bg-teal-500/10">
          <GitCompareArrows
            className="size-3.5 text-teal-600 dark:text-teal-400"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex-1 text-xs font-medium">Period comparison</div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/40">
        <PeriodColumn period={output.a} />
        <PeriodColumn period={output.b} />
      </div>

      <div className="grid grid-cols-2 gap-px sm:grid-cols-4 bg-border/40 border-t border-border/50">
        <DeltaTile
          label="Revenue"
          pct={output.delta.total_revenue_pct}
          detail={
            (output.delta.total_revenue_abs >= 0 ? "+" : "") +
            formatCurrency(output.delta.total_revenue_abs)
          }
        />
        <DeltaTile label="Gifts" pct={output.delta.gift_count_pct} />
        <DeltaTile label="Donors" pct={output.delta.donor_count_pct} />
        <DeltaTile label="Avg gift" pct={output.delta.average_gift_pct} />
      </div>

      {output.by_group && output.by_group.length > 0 && (
        <div className="border-t border-border/50 px-3 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            By {output.group_by}
          </div>
          <div className="space-y-1">
            {output.by_group.slice(0, 8).map((g) => (
              <div
                key={g.group}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="truncate">{g.group}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-muted-foreground">
                    {formatCurrency(g.a)} → {formatCurrency(g.b)}
                  </span>{" "}
                  <DeltaPill pct={g.delta_pct} compact />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.retention && (
        <div className="border-t border-border/50 px-3 py-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Donor retention
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <RetentionStat
              label="Retained"
              value={output.retention.retained_donors}
              hint={
                output.retention.retention_rate_pct != null
                  ? `${output.retention.retention_rate_pct}%`
                  : undefined
              }
            />
            <RetentionStat
              label="New in B"
              value={output.retention.new_donors_in_b}
            />
            <RetentionStat
              label="Lost"
              value={output.retention.lost_donors}
            />
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/30 transition-colors border-t border-border/50"
      >
        {expanded ? (
          <ChevronDown className="size-2.5" />
        ) : (
          <ChevronRight className="size-2.5" />
        )}
        <span>Raw data</span>
      </button>
      {expanded && (
        <pre className="max-h-40 overflow-auto border-t border-border/40 bg-muted/20 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  )
}

function PeriodColumn({ period }: { period: PeriodStat }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {period.label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">
        {formatCurrency(period.total_revenue)}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
        {period.gift_count} gifts · {period.donor_count} donors ·{" "}
        {formatCurrency(period.average_gift)} avg
      </div>
    </div>
  )
}

function DeltaTile({
  label,
  pct,
  detail,
}: {
  label: string
  pct: number | null
  detail?: string
}) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5">
        <DeltaPill pct={pct} />
      </div>
      {detail && (
        <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {detail}
        </div>
      )}
    </div>
  )
}

function DeltaPill({
  pct,
  compact,
}: {
  pct: number | null
  compact?: boolean
}) {
  if (pct == null) {
    return (
      <span
        className={
          compact
            ? "inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
            : "inline-flex items-center gap-0.5 text-xs text-muted-foreground"
        }
      >
        <Minus className={compact ? "size-2.5" : "size-3"} /> —
      </span>
    )
  }
  const up = pct > 0
  const flat = pct === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  const color = flat
    ? "text-muted-foreground"
    : up
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400"
  const sign = up ? "+" : ""
  return (
    <span
      className={
        (compact ? "inline-flex items-center gap-0.5 text-[10px] " : "inline-flex items-center gap-0.5 text-xs font-medium ") +
        color
      }
    >
      <Icon className={compact ? "size-2.5" : "size-3"} />
      {sign}
      {pct}%
    </span>
  )
}

function RetentionStat({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
        {hint && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
