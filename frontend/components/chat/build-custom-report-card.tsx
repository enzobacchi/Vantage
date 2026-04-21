"use client"

import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/format"

type FilterRowDisplay = {
  field: string
  operator: string
  value: string | number | string[]
  value2?: string | number
}

type ToolPart = {
  type: string
  state?: string
  toolCallId?: string
  output?: unknown
}

type CreateOutput =
  | {
      ok: true
      saved: true
      report: {
        id: string
        title: string
        summary: string
        filters: FilterRowDisplay[]
        selectedColumns: string[]
        columnLabels: string[]
        rowCount: number
        url: string
      }
    }
  | {
      ok: true
      saved: false
      report: {
        title: string
        summary: string
        filters: FilterRowDisplay[]
        selectedColumns: string[]
        rowCount: 0
      }
    }
  | {
      error: "unreliable_query" | "save_failed" | string
      reason?: unknown
      details?: unknown
    }
  | null

function isSaved(o: CreateOutput): o is Extract<CreateOutput, { saved: true }> {
  return !!o && typeof o === "object" && "saved" in o && o.saved === true
}

function isZeroResult(
  o: CreateOutput
): o is Extract<CreateOutput, { saved: false }> {
  return !!o && typeof o === "object" && "saved" in o && o.saved === false
}

function isError(
  o: CreateOutput
): o is Extract<CreateOutput, { error: string }> {
  return !!o && typeof o === "object" && "error" in o && typeof (o as { error: unknown }).error === "string"
}

function describeFilter(f: FilterRowDisplay): string {
  if (f.field === "donation_activity") {
    const verb = f.operator === "no_gift_between" ? "No gift between" : "Gave between"
    return `${verb} ${f.value} and ${f.value2 ?? "?"}`
  }
  const val = Array.isArray(f.value) ? `[${f.value.length} items]` : String(f.value)
  const tail = f.value2 != null ? ` and ${f.value2}` : ""
  return `${f.field} ${f.operator} ${val}${tail}`
}

/** Parse a single CSV row, honoring double-quoted cells with escaped quotes. */
function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === ",") {
        cells.push(cur)
        cur = ""
      } else if (c === '"') {
        inQuotes = true
      } else {
        cur += c
      }
    }
  }
  cells.push(cur)
  return cells
}

const CURRENCY_COLUMN_IDS = new Set(["lifetime_value", "last_gift_amount"])

function formatCell(value: string, columnId: string | undefined): string {
  if (!value) return "—"
  if (columnId && CURRENCY_COLUMN_IDS.has(columnId)) {
    return formatCurrency(value)
  }
  return value
}

function PreviewTable({
  reportId,
  columnLabels,
  selectedColumns,
  rowCount,
}: {
  reportId: string
  columnLabels: string[]
  selectedColumns: string[]
  rowCount: number
}) {
  const [rows, setRows] = React.useState<string[][] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    async function load() {
      try {
        const res = await fetch(`/api/reports/${reportId}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`Failed to load preview (${res.status})`)
        }
        const data = (await res.json()) as { content?: string }
        const content = data?.content ?? ""
        const lines = content.split("\n").filter((l) => l.length > 0)
        // Skip header (index 0), take up to 5 data rows
        const dataRows = lines.slice(1, 6).map(parseCsvRow)
        if (!cancelled) setRows(dataRows)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : "Unknown error"
        setError(msg)
      }
    }
    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [reportId])

  if (error) {
    return (
      <div className="mt-2 rounded bg-muted/50 px-2 py-2 text-[11px] text-muted-foreground">
        Couldn&apos;t load preview: {error}
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded bg-muted/50 px-2 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
        <span>Loading preview…</span>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="mt-2 rounded bg-muted/50 px-2 py-2 text-[11px] text-muted-foreground">
        No rows to preview.
      </div>
    )
  }

  const remaining = rowCount - rows.length

  return (
    <div className="mt-2 overflow-x-auto rounded border border-border">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            {columnLabels.map((label, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className="border-t border-border text-foreground"
            >
              {columnLabels.map((_, cIdx) => (
                <td
                  key={cIdx}
                  className="px-2 py-1.5 max-w-[160px] truncate"
                  title={row[cIdx] ?? ""}
                >
                  {formatCell(row[cIdx] ?? "", selectedColumns[cIdx])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 && (
        <div className="border-t border-border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
          + {remaining.toLocaleString()} more row{remaining === 1 ? "" : "s"} in the full report
        </div>
      )}
    </div>
  )
}

export function BuildCustomReportCard({ part }: { part: ToolPart }) {
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  const isDone = part.state === "result" || part.state === "output" || part.state === "output-available"
  const output = (part.output ?? null) as CreateOutput

  if (!isDone) {
    return (
      <div className="my-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Sparkles className="size-3 shrink-0 animate-pulse" strokeWidth={1.5} />
          <span>Creating report…</span>
        </div>
      </div>
    )
  }

  if (isZeroResult(output)) {
    return (
      <div className="my-2 rounded-lg border border-border bg-card text-xs">
        <div className="flex items-center gap-2 px-3 py-2">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{output.report.title}</div>
            <div className="text-[10px] text-muted-foreground">
              0 donors matched — not saved
            </div>
          </div>
        </div>
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {filtersOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <span>
              View filter ({output.report.filters.length} condition
              {output.report.filters.length === 1 ? "" : "s"})
            </span>
          </button>
          {filtersOpen && (
            <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {output.report.filters.map((f, i) => (
                <li key={i} className="rounded bg-muted/50 px-2 py-1 font-mono">
                  {describeFilter(f)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  if (isError(output)) {
    const isSaveFailed = output.error === "save_failed"
    const reasonStr =
      typeof output.reason === "string" && output.reason.trim().length > 0
        ? output.reason
        : null
    const primary = isSaveFailed ? "Couldn't save the report" : "Couldn't build that query"
    const secondary = isSaveFailed
      ? reasonStr ?? "Unknown error."
      : "The filter schema doesn't support this combination."
    const Icon = isSaveFailed ? XCircle : AlertTriangle
    const iconClass = isSaveFailed
      ? "text-destructive"
      : "text-amber-600 dark:text-amber-400"
    const detailsPayload = output.reason ?? output.details ?? output

    return (
      <div className="my-2 rounded-lg border border-border bg-card text-xs">
        <div className="flex items-center gap-2 px-3 py-2">
          <Icon className={`size-3.5 shrink-0 ${iconClass}`} strokeWidth={1.5} />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{primary}</div>
            <div className="text-[10px] text-muted-foreground truncate">{secondary}</div>
          </div>
        </div>
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {filtersOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <span>Show details</span>
          </button>
          {filtersOpen && (
            <pre className="mt-2 rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(detailsPayload, null, 2)}
            </pre>
          )}
        </div>
      </div>
    )
  }

  if (!isSaved(output)) return null

  const { id, title, summary, filters, selectedColumns, columnLabels, rowCount, url } = output.report
  const previewCap = Math.min(rowCount, 5)

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-xs">
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles
            className="size-3.5 mt-0.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{title}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {summary || `${rowCount.toLocaleString()} donor${rowCount === 1 ? "" : "s"} · Saved to Reports`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {rowCount.toLocaleString()}
          </Badge>
          <a
            href={url}
            className="group inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent transition-colors"
          >
            <span>Open</span>
            <ArrowRight
              className="size-3 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-transform"
              strokeWidth={1.5}
            />
          </a>
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {previewOpen ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <span>
            Preview ({previewCap} of {rowCount.toLocaleString()})
          </span>
        </button>
        {previewOpen && (
          <PreviewTable
            reportId={id}
            columnLabels={columnLabels}
            selectedColumns={selectedColumns}
            rowCount={rowCount}
          />
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {filtersOpen ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          <span>
            View filter ({filters.length} condition
            {filters.length === 1 ? "" : "s"})
          </span>
        </button>
        {filtersOpen && (
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {filters.map((f, i) => (
              <li key={i} className="rounded bg-muted/50 px-2 py-1 font-mono">
                {describeFilter(f)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="sr-only"
        data-report-id={id}
        aria-hidden="true"
      />
    </div>
  )
}
