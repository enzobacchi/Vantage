"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { toast } from "sonner"

import { searchDonors, type SearchDonorResult } from "@/app/actions/search"
import {
  getQuickLogConfig,
  quickLogTouchpoint,
  undoQuickLog,
  type QuickLogConfig,
  type QuickLogKindOption,
} from "@/app/actions/touchpoints"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

type PresetDonor = { id: string; name: string }

type QuickLogContextValue = {
  /** False until the config has loaded, and for organisations without the feature. */
  enabled: boolean
  /** Open the dialog, optionally with the donor already chosen. */
  open: (donor?: PresetDonor) => void
  /** Increments after every log or undo, so screens showing touchpoints can refresh. */
  version: number
}

const QuickLogContext = React.createContext<QuickLogContextValue>({
  enabled: false,
  open: () => {},
  version: 0,
})

export function useQuickLog(): QuickLogContextValue {
  return React.useContext(QuickLogContext)
}

/**
 * Mounts the quick-log dialog once for the whole app shell and exposes
 * `useQuickLog()`. Renders nothing extra for organisations without the
 * `quick_log` feature.
 */
export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<QuickLogConfig>({ enabled: false })
  const [dialog, setDialog] = React.useState<{ open: boolean; donor: PresetDonor | null; session: number }>({
    open: false,
    donor: null,
    session: 0,
  })
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    getQuickLogConfig()
      .then((c) => {
        if (!cancelled) setConfig(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const open = React.useCallback((donor?: PresetDonor) => {
    setDialog((d) => ({ open: true, donor: donor ?? null, session: d.session + 1 }))
  }, [])
  const bump = React.useCallback(() => setVersion((v) => v + 1), [])

  const value = React.useMemo(
    () => ({ enabled: config.enabled, open, version }),
    [config.enabled, open, version]
  )

  return (
    <QuickLogContext.Provider value={value}>
      {children}
      {config.enabled && (
        <Dialog open={dialog.open} onOpenChange={(next) => setDialog((d) => ({ ...d, open: next }))}>
          <DialogContent className="sm:max-w-md">
            {dialog.open && (
              <QuickLogForm
                key={dialog.session}
                kinds={config.kinds}
                showPoints={config.showPoints}
                presetDonor={dialog.donor}
                onClose={() => setDialog((d) => ({ ...d, open: false }))}
                onChanged={bump}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </QuickLogContext.Provider>
  )
}

function DonorPicker({ onPick }: { onPick: (donor: PresetDonor) => void }) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchDonorResult[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      searchDonors(q)
        .then((r) => {
          if (!cancelled) setResults(r.slice(0, 6))
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const shown = query.trim() ? results : []

  return (
    <div className="space-y-2">
      <Label htmlFor="quick-log-donor">Donor</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="quick-log-donor"
          autoFocus
          autoComplete="off"
          placeholder="Search by name or email"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && <Spinner className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2" />}
      </div>
      {shown.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border" aria-label="Matching donors">
          {shown.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => onPick({ id: d.id, name: d.display_name ?? "Unnamed donor" })}
              >
                <span className="min-w-0 truncate">{d.display_name ?? "Unnamed donor"}</span>
                {/* Lifetime giving tells apart donors who share a name. */}
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {formatCurrency(d.total_lifetime_value)} lifetime
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !loading && shown.length === 0 && (
        <p className="text-sm text-muted-foreground">No donors match &ldquo;{query.trim()}&rdquo;.</p>
      )}
    </div>
  )
}

function QuickLogForm({
  kinds,
  showPoints,
  presetDonor,
  onClose,
  onChanged,
}: {
  kinds: QuickLogKindOption[]
  showPoints: boolean
  presetDonor: PresetDonor | null
  onClose: () => void
  onChanged: () => void
}) {
  const [donor, setDonor] = React.useState<PresetDonor | null>(presetDonor)
  const [kind, setKind] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const canSave = !!donor && !!kind && !saving

  const save = async () => {
    if (!donor || !kind) return
    setSaving(true)
    const result = await quickLogTouchpoint({ donorId: donor.id, kind, note })
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onChanged()
    onClose()

    const title = showPoints && result.points > 0 ? `${result.kindLabel} logged · +${result.points}` : `${result.kindLabel} logged`
    const meterText = result.meter
      ? ` · ${result.meter.fill} / ${result.meter.capacity}${result.meter.ready ? " · Ready to ask" : ""}`
      : ""
    toast.success(title, {
      description: `${result.donorName}${meterText}`,
      duration: 8000, // long enough to reach Undo
      action: {
        label: "Undo",
        onClick: async () => {
          const undone = await undoQuickLog(result.interactionId)
          if (!undone.ok) {
            toast.error(undone.error)
            return
          }
          toast("Touchpoint removed")
          onChanged()
        },
      },
    })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
          e.preventDefault()
          void save()
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Log a touchpoint</DialogTitle>
        <DialogDescription>Pick what happened. A note is optional.</DialogDescription>
      </DialogHeader>

      {donor ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium">{donor.name}</span>
          {!presetDonor && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              aria-label="Choose a different donor"
              onClick={() => setDonor(null)}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <DonorPicker onPick={setDonor} />
      )}

      <div className="space-y-2">
        <Label id="quick-log-kind-label">What was it?</Label>
        <div role="radiogroup" aria-labelledby="quick-log-kind-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              className={cn(
                "flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kind === k.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              <span className="font-medium">{k.label}</span>
              {showPoints && k.points > 0 && (
                <span className={cn("tabular-nums text-xs", kind === k.key ? "opacity-80" : "text-muted-foreground")}>
                  +{k.points}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="quick-log-note">Note (optional)</Label>
        <Textarea
          id="quick-log-note"
          rows={2}
          placeholder="Anything worth remembering"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saving ? "Saving…" : "Log touchpoint"}
        </Button>
      </DialogFooter>
    </form>
  )
}
