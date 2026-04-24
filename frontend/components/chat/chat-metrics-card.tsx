"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { BarChart3, ChevronDown, ChevronRight, Loader2 } from "lucide-react"

import { formatCurrency } from "@/lib/format"

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type MetricsOutput = {
  total_count: number
  total_revenue: number
  average_gift: number
  unique_donor_count: number
  donors_by_lifecycle?: Record<string, number>
  donors_by_type?: Record<string, number>
  group_by?: string
  breakdown?: Array<{
    group: string
    total: number
    gift_count: number
    donor_count: number
  }>
}

const BAR_COLORS = [
  "#21E0D6",
  "#007A3F",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#34D399",
  "#F87171",
]

export function ChatMetricsCard({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = React.useState(false)
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "result"
  const output = part.output as MetricsOutput | undefined

  if (!isDone || !output) {
    return (
      <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        <span>Calculating metrics…</span>
      </div>
    )
  }

  const breakdown = output.breakdown?.slice(0, 10) ?? []
  const chartData = breakdown.map((b, i) => ({
    ...b,
    fill: BAR_COLORS[i % BAR_COLORS.length],
  }))
  const maxLabelLen = breakdown.reduce(
    (m, b) => Math.max(m, b.group.length),
    0
  )
  const chartHeight = Math.max(160, breakdown.length * 28)

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex size-6 items-center justify-center rounded-md bg-teal-500/10">
          <BarChart3
            className="size-3.5 text-teal-600 dark:text-teal-400"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex-1 text-xs font-medium">Donation metrics</div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/40 sm:grid-cols-4">
        <Kpi label="Revenue" value={formatCurrency(output.total_revenue)} />
        <Kpi label="Gifts" value={String(output.total_count)} />
        <Kpi label="Donors" value={String(output.unique_donor_count)} />
        <Kpi label="Avg gift" value={formatCurrency(output.average_gift)} />
      </div>

      {breakdown.length > 0 && (
        <div className="px-3 py-3 border-t border-border/50">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Revenue by {output.group_by}
          </div>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="group"
                  width={Math.min(160, maxLabelLen * 7 + 12)}
                  tick={{ fontSize: 11, fill: "currentColor" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar dataKey="total" radius={[0, 3, 3, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {breakdown.map((b) => (
              <li
                key={b.group}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{b.group}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {formatCurrency(b.total)}{" "}
                  <span className="text-muted-foreground">
                    · {b.gift_count} gifts · {b.donor_count} donors
                  </span>
                </span>
              </li>
            ))}
          </ul>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}
