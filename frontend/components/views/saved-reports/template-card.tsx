"use client"

import * as React from "react"
import { Download, Loader2, Save, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useNav } from "@/components/nav-context"
import { formatCurrency } from "@/lib/format"
import {
  resolvePeriod,
  type PeriodPreset,
} from "@/lib/fiscal-year"

export type TemplateKey =
  | "retention"
  | "acquisition"
  | "recapture"
  | "new-leads-by-source"

export type TemplateMeta = {
  key: TemplateKey
  title: string
  description: string
  icon: LucideIcon
}

type DonorRef = { id: string; display_name: string | null }
type AcquisitionDonor = DonorRef & { first_gift_date: string | null; first_gift_amount: number | null }
type RecaptureDonor = DonorRef & {
  previous_gift_date: string | null
  recapture_gift_date: string | null
  recapture_amount: number | null
}
type LeadsRow = { source: string; donor_count: number; total_raised: number }

type TemplateData = Record<string, unknown>

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "this-fiscal-year": "This fiscal year",
  "last-fiscal-year": "Last fiscal year",
  "this-calendar-year": "This calendar year",
  custom: "Custom range",
}

function formatPercent(rate: unknown): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—"
  return `${(rate * 100).toFixed(1)}%`
}

function formatNumber(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—"
  return n.toLocaleString()
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function safeFilename(s: string): string {
  return s.trim().replace(/[^\w\-. ]+/g, "").replace(/\s+/g, "_") || "report"
}

export function TemplateCard({
  meta,
  fiscalYearStartMonth,
  onSavedReport,
}: {
  meta: TemplateMeta
  fiscalYearStartMonth: number
  onSavedReport?: () => void
}) {
  const [preset, setPreset] = React.useState<PeriodPreset>("this-fiscal-year")
  const [customStart, setCustomStart] = React.useState("")
  const [customEnd, setCustomEnd] = React.useState("")
  const [lapsedMin, setLapsedMin] = React.useState(3)
  const [lapsedMax, setLapsedMax] = React.useState(5)
  const [data, setData] = React.useState<TemplateData | null>(null)
  const [csv, setCsv] = React.useState<string>("")
  const [period, setPeriod] = React.useState<{ start: string; end: string } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveTitle, setSaveTitle] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [donorsOpen, setDonorsOpen] = React.useState(false)

  const Icon = meta.icon

  async function run() {
    setLoading(true)
    setError(null)
    try {
      let start: string
      let end: string
      try {
        const resolved = resolvePeriod(preset, fiscalYearStartMonth, {
          start: customStart || undefined,
          end: customEnd || undefined,
        })
        start = resolved.start
        end = resolved.end
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid custom range"
        setError(msg)
        setLoading(false)
        toast.error(msg)
        return
      }

      const params = new URLSearchParams({ periodStart: start, periodEnd: end })
      if (meta.key === "recapture") {
        params.set("lapsedMinYears", String(lapsedMin))
        params.set("lapsedMaxYears", String(lapsedMax))
      }
      const res = await fetch(
        `/api/reports/templates/${meta.key}?${params.toString()}`,
        { cache: "no-store" }
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`)
      }
      setData(json.data as TemplateData)
      setCsv(json.csv ?? "")
      setPeriod({ start: json.periodStart, end: json.periodEnd })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run report"
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function handleExport() {
    if (!csv || !period) return
    const filename = `${safeFilename(meta.title)}_${period.start}_to_${period.end}.csv`
    downloadCsv(filename, csv)
  }

  async function handleSave() {
    if (!csv || !period) return
    if (!saveTitle.trim()) {
      toast.error("Please enter a report name")
      return
    }
    setSaving(true)
    try {
      const summary = `${meta.title}: ${period.start} – ${period.end}`
      const res = await fetch(`/api/reports/templates/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: saveTitle.trim(), csv, summary }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `Save failed (${res.status})`)
      toast.success(`Saved "${saveTitle.trim()}" to your reports`)
      setSaveOpen(false)
      setSaveTitle("")
      onSavedReport?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save report"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <CardTitle className="text-base">{meta.title}</CardTitle>
        </div>
        <CardDescription className="leading-snug">{meta.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs text-muted-foreground mb-1 block">Period</Label>
            <Select
              value={preset}
              onValueChange={(v) => {
                setPreset(v as PeriodPreset)
                setData(null)
                setCsv("")
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
                  <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                Running…
              </>
            ) : (
              "Run Report"
            )}
          </Button>
        </div>

        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${meta.key}-start`} className="text-xs text-muted-foreground mb-1 block">Start</Label>
              <Input
                id={`${meta.key}-start`}
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor={`${meta.key}-end`} className="text-xs text-muted-foreground mb-1 block">End</Label>
              <Input
                id={`${meta.key}-end`}
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        )}

        {meta.key === "recapture" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={`${meta.key}-min`} className="text-xs text-muted-foreground mb-1 block">Lapsed window (min years)</Label>
              <Input
                id={`${meta.key}-min`}
                type="number"
                min={1}
                max={20}
                value={lapsedMin}
                onChange={(e) => setLapsedMin(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor={`${meta.key}-max`} className="text-xs text-muted-foreground mb-1 block">Lapsed window (max years)</Label>
              <Input
                id={`${meta.key}-max`}
                type="number"
                min={lapsedMin}
                max={20}
                value={lapsedMax}
                onChange={(e) => setLapsedMax(Math.max(lapsedMin, parseInt(e.target.value || String(lapsedMin), 10)))}
                className="h-8"
              />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && period && (
          <>
            <p className="text-xs text-muted-foreground">
              {period.start} – {period.end}
            </p>
            <TemplateResult
              templateKey={meta.key}
              data={data}
              onViewDonors={() => setDonorsOpen(true)}
            />
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="size-4" strokeWidth={1.5} />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaveTitle(`${meta.title} (${period.start} – ${period.end})`)
                  setSaveOpen(true)
                }}
              >
                <Save className="size-4" strokeWidth={1.5} />
                Save to Reports
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={donorsOpen} onOpenChange={setDonorsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{meta.title} — donors</DialogTitle>
          </DialogHeader>
          <DonorsDrilldown templateKey={meta.key} data={data} />
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Save report</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${meta.key}-save-title`}>Report name</Label>
            <Input
              id={`${meta.key}-save-title`}
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !saveTitle.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TemplateResult({
  templateKey,
  data,
  onViewDonors,
}: {
  templateKey: TemplateKey
  data: TemplateData
  onViewDonors: () => void
}) {
  if (templateKey === "retention") {
    return (
      <ResultPair
        primary={{ label: "Retention rate", value: formatPercent(data.rate) }}
        secondary={[
          { label: "Retained", value: formatNumber(data.retained_count) },
          { label: "Lapsed", value: formatNumber(data.lapsed_count) },
          { label: "Prior period", value: formatNumber(data.prior_period_donors) },
        ]}
        onViewDonors={onViewDonors}
        viewDonorsLabel="View retained / lapsed"
      />
    )
  }

  if (templateKey === "acquisition") {
    return (
      <ResultPair
        primary={{ label: "Acquisition rate", value: formatPercent(data.rate) }}
        secondary={[
          { label: "First-time donors", value: formatNumber(data.first_time_count) },
          { label: "Total donors in period", value: formatNumber(data.total_donors_period) },
        ]}
        onViewDonors={onViewDonors}
        viewDonorsLabel="View first-time donors"
      />
    )
  }

  if (templateKey === "recapture") {
    const donors = (data.donors as RecaptureDonor[] | undefined) ?? []
    return (
      <ResultPair
        primary={{ label: "Recaptured donors", value: formatNumber(data.recaptured_count) }}
        secondary={[
          { label: "Lapsed window (years)", value: `${data.lapsed_window_min_years}–${data.lapsed_window_max_years}` },
        ]}
        onViewDonors={donors.length > 0 ? onViewDonors : undefined}
        viewDonorsLabel="View recaptured donors"
      />
    )
  }

  // new-leads-by-source
  const rows = (data.rows as LeadsRow[] | undefined) ?? []
  return (
    <div className="space-y-3">
      <ResultPair
        primary={{
          label: "New donors",
          value: formatNumber(data.total_new_donors),
        }}
        secondary={[
          {
            label: "Total raised",
            value: formatCurrency((data.total_raised as number | null | undefined) ?? null),
          },
        ]}
      />
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Donors</TableHead>
                <TableHead className="text-right">Raised</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.source}>
                  <TableCell>{r.source}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.donor_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.total_raised)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No new donors in this period.</p>
      )}
    </div>
  )
}

function ResultPair({
  primary,
  secondary,
  onViewDonors,
  viewDonorsLabel,
}: {
  primary: { label: string; value: string }
  secondary: { label: string; value: string }[]
  onViewDonors?: () => void
  viewDonorsLabel?: string
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{primary.label}</p>
        <p className="text-2xl font-semibold tabular-nums">{primary.value}</p>
      </div>
      {secondary.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {secondary.map((s) => (
            <React.Fragment key={s.label}>
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="text-right tabular-nums">{s.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {onViewDonors && viewDonorsLabel && (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onViewDonors}>
          {viewDonorsLabel}
        </Button>
      )}
    </div>
  )
}

function DonorsDrilldown({
  templateKey,
  data,
}: {
  templateKey: TemplateKey
  data: TemplateData | null
}) {
  const { openDonor } = useNav()
  if (!data) return null

  if (templateKey === "retention") {
    const retained = (data.retained as DonorRef[] | undefined) ?? []
    const lapsed = (data.lapsed as DonorRef[] | undefined) ?? []
    return (
      <div className="grid gap-4 md:grid-cols-2 max-h-[60vh] overflow-auto">
        <DonorList title={`Retained (${retained.length})`} donors={retained} onClick={openDonor} />
        <DonorList title={`Lapsed (${lapsed.length})`} donors={lapsed} onClick={openDonor} />
      </div>
    )
  }

  if (templateKey === "acquisition") {
    const donors = (data.donors as AcquisitionDonor[] | undefined) ?? []
    if (donors.length === 0) {
      return <p className="text-sm text-muted-foreground">No first-time donors in this period.</p>
    }
    return (
      <div className="max-h-[60vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>First gift date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donors.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  <button type="button" onClick={() => openDonor(d.id)} className="text-left hover:underline">
                    {d.display_name ?? "Unnamed donor"}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{d.first_gift_date ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(d.first_gift_amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (templateKey === "recapture") {
    const donors = (data.donors as RecaptureDonor[] | undefined) ?? []
    if (donors.length === 0) {
      return <p className="text-sm text-muted-foreground">No recaptured donors.</p>
    }
    return (
      <div className="max-h-[60vh] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>Previous gift</TableHead>
              <TableHead>Recapture gift</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {donors.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  <button type="button" onClick={() => openDonor(d.id)} className="text-left hover:underline">
                    {d.display_name ?? "Unnamed donor"}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{d.previous_gift_date ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.recapture_gift_date ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(d.recapture_amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return null
}

function DonorList({
  title,
  donors,
  onClick,
}: {
  title: string
  donors: DonorRef[]
  onClick: (id: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {donors.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {donors.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onClick(d.id)} className="text-left hover:underline">
                {d.display_name ?? "Unnamed donor"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
