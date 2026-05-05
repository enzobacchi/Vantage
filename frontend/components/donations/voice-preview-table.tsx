"use client"

import * as React from "react"
import { Check, Plus, Trash2, TriangleAlert, UserPlus } from "lucide-react"

import type { OrgDonationOptionRow } from "@/app/actions/donations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import { Textarea } from "@/components/ui/textarea"
import {
  VOICE_PAYMENT_METHODS,
  type ParsedDonationWithMatch,
  type VoicePaymentMethod,
} from "@/lib/donations/voice-schema"
import { cn } from "@/lib/utils"

type DonorMode = "existing" | "create"
type DonorType = "individual" | "corporate" | "school" | "church"

export type DraftRow = {
  rowId: string

  // Donor resolution
  donorMode: DonorMode
  donorId: string | null
  donorLabel: string | null
  newDonorName: string
  newDonorEmail: string
  newDonorType: DonorType

  // Donation fields
  amount: string
  date: string
  paymentMethod: VoicePaymentMethod
  categoryId: string
  campaignId: string
  fundId: string
  memo: string

  // AI hints — when the AI mentioned a name we couldn't resolve to an option
  aiHintCategory: string | null
  aiHintCampaign: string | null
  aiHintFund: string | null

  // Confidence from the parser (null for manually-added rows)
  confidence: "high" | "medium" | "low" | null
}

const PAYMENT_LABELS: Record<VoicePaymentMethod, string> = {
  check: "Check",
  cash: "Cash",
  zelle: "Zelle",
  wire: "Wire",
  venmo: "Venmo",
  daf: "DAF",
  other: "Other",
}

const DONOR_TYPE_OPTIONS: { value: DonorType; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "corporate", label: "Corporate" },
  { value: "school", label: "School" },
  { value: "church", label: "Church" },
]

let __rowSeq = 0
function nextRowId(): string {
  __rowSeq += 1
  return `r${Date.now()}-${__rowSeq}`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyDraftRow(): DraftRow {
  return {
    rowId: nextRowId(),
    donorMode: "existing",
    donorId: null,
    donorLabel: null,
    newDonorName: "",
    newDonorEmail: "",
    newDonorType: "individual",
    amount: "",
    date: todayISO(),
    paymentMethod: "check",
    categoryId: "",
    campaignId: "",
    fundId: "",
    memo: "",
    aiHintCategory: null,
    aiHintCampaign: null,
    aiHintFund: null,
    confidence: null,
  }
}

export function parsedToDraft(p: ParsedDonationWithMatch): DraftRow {
  return {
    rowId: nextRowId(),
    donorMode: p.suggested_donor_id ? "existing" : "create",
    donorId: p.suggested_donor_id,
    donorLabel: p.suggested_donor_label,
    newDonorName: p.suggested_donor_id ? "" : p.donor_query,
    newDonorEmail: "",
    newDonorType: "individual",
    amount: String(p.amount),
    date: p.date,
    paymentMethod: p.payment_method,
    categoryId: p.suggested_category_id ?? "",
    campaignId: p.suggested_campaign_id ?? "",
    fundId: p.suggested_fund_id ?? "",
    memo: p.memo ?? "",
    aiHintCategory: p.suggested_category_id ? null : p.category_name,
    aiHintCampaign: p.suggested_campaign_id ? null : p.campaign_name,
    aiHintFund: p.suggested_fund_id ? null : p.fund_name,
    confidence: p.confidence,
  }
}

export function rowValidationError(r: DraftRow): string | null {
  if (r.donorMode === "existing" && !r.donorId) return "Pick a donor"
  if (r.donorMode === "create" && !r.newDonorName.trim()) return "New donor needs a name"
  const amt = parseFloat(r.amount)
  if (!Number.isFinite(amt) || amt <= 0) return "Amount must be > 0"
  if (!r.date || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return "Invalid date"
  return null
}

type Props = {
  rows: DraftRow[]
  onChange: (rows: DraftRow[]) => void
  categories: OrgDonationOptionRow[]
  campaigns: OrgDonationOptionRow[]
  funds: OrgDonationOptionRow[]
}

export function VoicePreviewTable({
  rows,
  onChange,
  categories,
  campaigns,
  funds,
}: Props) {
  const updateRow = (rowId: string, patch: Partial<DraftRow>) => {
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }
  const removeRow = (rowId: string) => {
    onChange(rows.filter((r) => r.rowId !== rowId))
  }
  const addRow = () => {
    onChange([...rows, emptyDraftRow()])
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Donor</TableHead>
              <TableHead className="w-[110px]">Amount</TableHead>
              <TableHead className="w-[150px]">Date</TableHead>
              <TableHead className="w-[120px]">Method</TableHead>
              <TableHead className="w-[160px]">Category</TableHead>
              <TableHead className="w-[160px]">Campaign</TableHead>
              <TableHead className="w-[160px]">Fund</TableHead>
              <TableHead className="min-w-[180px]">Memo</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                  No rows yet. Dictate to extract donations or add a row manually.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const error = rowValidationError(row)
                return (
                  <TableRow key={row.rowId} className={cn(error && "bg-destructive/5")}>
                    <TableCell className="align-top py-2">
                      <DonorCell row={row} onChange={(p) => updateRow(row.rowId, p)} />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateRow(row.rowId, { amount: e.target.value })}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.rowId, { date: e.target.value })}
                        className="h-9"
                      />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Select
                        value={row.paymentMethod}
                        onValueChange={(v) =>
                          updateRow(row.rowId, { paymentMethod: v as VoicePaymentMethod })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOICE_PAYMENT_METHODS.map((pm) => (
                            <SelectItem key={pm} value={pm}>
                              {PAYMENT_LABELS[pm]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <OptionSelect
                        value={row.categoryId}
                        options={categories}
                        onChange={(v) => updateRow(row.rowId, { categoryId: v })}
                        aiHint={row.aiHintCategory}
                      />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <OptionSelect
                        value={row.campaignId}
                        options={campaigns}
                        onChange={(v) => updateRow(row.rowId, { campaignId: v })}
                        aiHint={row.aiHintCampaign}
                      />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <OptionSelect
                        value={row.fundId}
                        options={funds}
                        onChange={(v) => updateRow(row.rowId, { fundId: v })}
                        aiHint={row.aiHintFund}
                      />
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Textarea
                        value={row.memo}
                        onChange={(e) => updateRow(row.rowId, { memo: e.target.value })}
                        placeholder="Optional"
                        rows={1}
                        className="min-h-[36px] resize-none text-sm"
                      />
                      {(row.confidence === "low" || error) && (
                        <p
                          className={cn(
                            "mt-1 flex items-center gap-1 text-xs",
                            error ? "text-destructive" : "text-amber-600 dark:text-amber-500"
                          )}
                        >
                          <TriangleAlert className="size-3" strokeWidth={1.5} />
                          {error ?? "Low confidence — double-check this row"}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(row.rowId)}
                        title="Remove row"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
        <Plus className="size-4" strokeWidth={1.5} />
        Add row
      </Button>
    </div>
  )
}

// ── Donor cell ────────────────────────────────────────────────────────

type DonorSearchItem = { id: string; display_name: string | null }

function DonorCell({
  row,
  onChange,
}: {
  row: DraftRow
  onChange: (patch: Partial<DraftRow>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<DonorMode>(row.donorMode)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<DonorSearchItem[]>([])
  const [searching, setSearching] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (!open) return
    setTab(row.donorMode)
  }, [open, row.donorMode])

  React.useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`/api/donors/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((arr: DonorSearchItem[]) => setResults(Array.isArray(arr) ? arr : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const pickExisting = (d: DonorSearchItem) => {
    onChange({
      donorMode: "existing",
      donorId: d.id,
      donorLabel: d.display_name ?? "Unknown",
    })
    setOpen(false)
    setQuery("")
    setResults([])
  }

  const switchToCreate = () => {
    onChange({
      donorMode: "create",
      donorId: null,
      donorLabel: null,
      newDonorName: row.newDonorName || query.trim(),
    })
  }

  const triggerLabel = (() => {
    if (row.donorMode === "existing" && row.donorId) {
      return (
        <span className="flex items-center gap-1.5 truncate">
          <Check className="size-3.5 text-emerald-600" strokeWidth={1.5} />
          <span className="truncate">{row.donorLabel}</span>
        </span>
      )
    }
    if (row.donorMode === "create" && row.newDonorName.trim()) {
      return (
        <span className="flex items-center gap-1.5 truncate text-amber-700 dark:text-amber-400">
          <UserPlus className="size-3.5" strokeWidth={1.5} />
          <span className="truncate">Create: {row.newDonorName}</span>
        </span>
      )
    }
    return <span className="text-muted-foreground">Pick a donor…</span>
  })()

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-9 w-full justify-between font-normal"
          >
            {triggerLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex border-b">
            <button
              type="button"
              className={cn(
                "flex-1 px-3 py-2 text-sm font-medium",
                tab === "existing" ? "border-b-2 border-foreground" : "text-muted-foreground"
              )}
              onClick={() => setTab("existing")}
            >
              Existing
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 px-3 py-2 text-sm font-medium",
                tab === "create" ? "border-b-2 border-foreground" : "text-muted-foreground"
              )}
              onClick={() => {
                setTab("create")
                switchToCreate()
              }}
            >
              Create new
            </button>
          </div>

          {tab === "existing" ? (
            <div className="flex flex-col">
              <Input
                placeholder="Search donors…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-none border-0 border-b focus-visible:ring-0"
                autoFocus
              />
              <div className="max-h-60 overflow-y-auto">
                {searching && (
                  <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                )}
                {!searching && !query.trim() && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Type to search by name or email.
                  </p>
                )}
                {!searching && query.trim() && results.length === 0 && (
                  <div className="p-3 space-y-2">
                    <p className="text-sm text-muted-foreground">No matches.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        onChange({
                          donorMode: "create",
                          donorId: null,
                          donorLabel: null,
                          newDonorName: query.trim(),
                        })
                        setTab("create")
                      }}
                    >
                      <UserPlus className="size-3.5 mr-2" strokeWidth={1.5} />
                      Create &ldquo;{query.trim()}&rdquo;
                    </Button>
                  </div>
                )}
                {!searching &&
                  results.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => pickExisting(d)}
                    >
                      {d.display_name ?? "Unknown"}
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-3">
              <div className="space-y-1.5">
                <Label htmlFor={`new-name-${row.rowId}`} className="text-xs">
                  Display name *
                </Label>
                <Input
                  id={`new-name-${row.rowId}`}
                  value={row.newDonorName}
                  onChange={(e) => onChange({ newDonorName: e.target.value })}
                  placeholder="Jane Smith"
                  className="h-8"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`new-type-${row.rowId}`} className="text-xs">
                  Type
                </Label>
                <Select
                  value={row.newDonorType}
                  onValueChange={(v) => onChange({ newDonorType: v as DonorType })}
                >
                  <SelectTrigger id={`new-type-${row.rowId}`} className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DONOR_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`new-email-${row.rowId}`} className="text-xs">
                  Email (optional)
                </Label>
                <Input
                  id={`new-email-${row.rowId}`}
                  type="email"
                  value={row.newDonorEmail}
                  onChange={(e) => onChange({ newDonorEmail: e.target.value })}
                  placeholder="optional"
                  className="h-8"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={() => setOpen(false)}
                disabled={!row.newDonorName.trim()}
              >
                Done
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {row.confidence === "medium" && row.donorMode === "existing" && row.donorId && (
        <Badge variant="outline" className="text-xs font-normal">
          Confirm match
        </Badge>
      )}
    </div>
  )
}

// ── Option select with optional AI hint ───────────────────────────────

function OptionSelect({
  value,
  options,
  onChange,
  aiHint,
}: {
  value: string
  options: OrgDonationOptionRow[]
  onChange: (v: string) => void
  aiHint: string | null
}) {
  return (
    <div className="space-y-1">
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">—</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {aiHint && !value && (
        <p className="text-xs text-amber-600 dark:text-amber-500 truncate">
          AI heard: &ldquo;{aiHint}&rdquo;
        </p>
      )}
    </div>
  )
}
