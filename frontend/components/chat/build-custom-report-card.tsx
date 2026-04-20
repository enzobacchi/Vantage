"use client"

import * as React from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Save, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SampleDonor = {
  id?: string
  display_name?: string
  total_lifetime_value?: number | string | null
  last_donation_date?: string | null
}

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

type BuildOutput =
  | {
      ok: true
      preview: {
        title: string
        summary: string
        filters: FilterRowDisplay[]
        selectedColumns: string[]
        rowCount: number
        sampleDonors: SampleDonor[]
        pendingSaveToken: string
      }
    }
  | { error: string; reason?: unknown }
  | null

function isOk(o: BuildOutput): o is Extract<BuildOutput, { ok: true }> {
  return !!o && typeof o === "object" && "ok" in o && o.ok === true
}

function formatCurrency(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v ?? 0)
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(v: unknown): string {
  if (!v) return "—"
  const s = String(v)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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

export function BuildCustomReportCard({ part }: { part: ToolPart }) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState<{ id: string; title: string } | null>(null)

  const isDone = part.state === "result" || part.state === "output" || part.state === "output-available"
  const output = (part.output ?? null) as BuildOutput

  if (!isDone) {
    return (
      <div className="my-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3 animate-spin shrink-0" />
          <span>Building report…</span>
        </div>
      </div>
    )
  }

  // Errors render nothing — the model's text reply (the canonical safety
  // sentence) carries the message.
  if (!isOk(output)) return null

  const { title, filters, rowCount, sampleDonors, pendingSaveToken } = output.preview
  const isZero = rowCount === 0

  async function onSave() {
    setSaving(true)
    try {
      const { saveCustomReport } = await import("@/app/actions/reports")
      const result = await saveCustomReport(pendingSaveToken, "private")
      setSaved({ id: result.id, title: result.title })
      toast.success(`Saved "${result.title}" to Reports`)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save report"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-xs">
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{title}</div>
            <div className="text-[10px] text-muted-foreground">
              {rowCount === 0
                ? "0 donors matched"
                : `${rowCount.toLocaleString()} donor${rowCount === 1 ? "" : "s"} matched`}
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {rowCount.toLocaleString()}
        </Badge>
      </div>

      {isZero && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3 mt-0.5 shrink-0" strokeWidth={1.5} />
          <span>0 donors matched. Does the filter below match what you meant?</span>
        </div>
      )}

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
          <span>View filter ({filters.length} condition{filters.length === 1 ? "" : "s"})</span>
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

      {sampleDonors.length > 0 && (
        <div className="border-t border-border px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Sample
          </div>
          <ul className="space-y-1 text-[11px]">
            {sampleDonors.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-foreground">
                <span className="truncate">{d.display_name ?? "—"}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatCurrency(d.total_lifetime_value)} · {formatDate(d.last_donation_date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isZero && (
        <div className="border-t border-border px-3 py-2">
          {saved ? (
            <div className="text-[11px] text-foreground">
              Saved to Reports.{" "}
              <a
                href={`/?view=reports&highlight=${saved.id}`}
                className="underline hover:no-underline"
              >
                Open
              </a>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onSave}
              disabled={saving}
              className={cn("h-7 text-xs gap-1.5")}
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" strokeWidth={1.5} />
              )}
              {saving ? "Saving…" : "Save to Reports"}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
