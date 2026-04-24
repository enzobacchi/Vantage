"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChevronDown, ChevronRight, LineChart as LineIcon, Loader2 } from "lucide-react"

import { formatCurrency } from "@/lib/format"

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type SeriesRow = Record<string, number | string>

type TimeseriesOutput = {
  interval: "day" | "week" | "month" | "quarter" | "year"
  metric: "revenue" | "donor_count" | "gift_count" | "avg_gift"
  group_by: string | null
  groups: string[]
  series: SeriesRow[]
  total_revenue: number
  total_gifts: number
}

const SERIES_COLORS = [
  "#21E0D6",
  "#007A3F",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#34D399",
  "#F87171",
]

const METRIC_LABELS: Record<TimeseriesOutput["metric"], string> = {
  revenue: "Revenue",
  donor_count: "Donors",
  gift_count: "Gifts",
  avg_gift: "Avg gift",
}

export function ChatTimeseriesChart({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = React.useState(false)
  const isDone =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "result"
  const output = part.output as TimeseriesOutput | undefined

  if (!isDone || !output) {
    return (
      <div className="my-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin shrink-0 text-teal-500" />
        <span>Charting donations…</span>
      </div>
    )
  }

  const { series, groups, group_by, metric, interval } = output
  const isCurrency = metric === "revenue" || metric === "avg_gift"
  const formatValue = (n: number) =>
    isCurrency ? formatCurrency(n) : n.toLocaleString()
  const dataKeys = group_by ? groups : ["total"]

  return (
    <div className="my-2 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex size-6 items-center justify-center rounded-md bg-teal-500/10">
          <LineIcon
            className="size-3.5 text-teal-600 dark:text-teal-400"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex-1 text-xs font-medium">
          {METRIC_LABELS[metric]} by {interval}
          {group_by ? ` · ${group_by}` : ""}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatCurrency(output.total_revenue)} · {output.total_gifts} gifts
        </div>
      </div>

      <div className="px-3 py-3">
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            {group_by ? (
              <BarChart
                data={series}
                margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.12}
                />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    isCurrency
                      ? `$${Math.round(v / 1000)}k`
                      : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                  formatter={(value: number, name: string) => [
                    formatValue(value),
                    name,
                  ]}
                />
                {dataKeys.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="1"
                    fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    radius={i === dataKeys.length - 1 ? [3, 3, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart
                data={series}
                margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.12}
                />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    isCurrency
                      ? `$${Math.round(v / 1000)}k`
                      : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                  }}
                  formatter={(value: number) => [formatValue(value), METRIC_LABELS[metric]]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={SERIES_COLORS[0]}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: SERIES_COLORS[0] }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        {group_by && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {groups.map((g, i) => (
              <span key={g} className="inline-flex items-center gap-1">
                <span
                  className="size-2 rounded-sm"
                  style={{
                    background: SERIES_COLORS[i % SERIES_COLORS.length],
                  }}
                />
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

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
