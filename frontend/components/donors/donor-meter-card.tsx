"use client"

import * as React from "react"
import { CheckCircle2, Gauge, Pencil } from "lucide-react"
import { toast } from "sonner"

import { getMeterForDonor, recordAsk, updateMeterCapacity } from "@/app/actions/meter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { applyAskOutcome, type AskOutcome, type TouchpointKind } from "@/lib/meter/rules"
import type { DonorMeter, MeterTouchpoint } from "@/lib/meter/service"
import { cn } from "@/lib/utils"

type Person = { user_id: string; name: string }

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function kindLabel(kinds: TouchpointKind[], t: MeterTouchpoint): string {
  return kinds.find((k) => k.key === t.kind)?.label ?? t.type.charAt(0).toUpperCase() + t.type.slice(1)
}

/** The bar: one segment per touchpoint, oldest first, sized by its points. */
function MeterBar({
  meter,
  kinds,
  people,
}: {
  meter: DonorMeter
  kinds: TouchpointKind[]
  people: Map<string, string>
}) {
  const { fill, capacity, ready } = meter.status
  const carried = fill - meter.touchpoints.reduce((sum, t) => sum + t.points, 0)
  const scale = Math.max(capacity, fill)
  const width = (points: number) => `${(points / scale) * 100}%`
  const tone = ready ? "bg-emerald-500 dark:bg-emerald-400" : "bg-primary"

  return (
    <TooltipProvider delayDuration={100}>
      <div
        role="meter"
        aria-label="Touchpoint meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.min(fill, capacity)}
        aria-valuetext={`${fill} of ${capacity} points`}
        className="flex h-3 w-full gap-px overflow-hidden rounded-full bg-muted"
      >
        {carried > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn("h-full opacity-50", tone)} style={{ width: width(carried) }} />
            </TooltipTrigger>
            <TooltipContent className="text-xs">{carried} points carried over from the last ask</TooltipContent>
          </Tooltip>
        )}
        {[...meter.touchpoints].reverse().map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <div className={cn("h-full transition-all", tone)} style={{ width: width(t.points) }} />
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {kindLabel(kinds, t)} · +{t.points} · {shortDate(t.date)}
              {t.createdBy && people.get(t.createdBy) ? ` · ${people.get(t.createdBy)}` : ""}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

function CapacityEditor({
  donorId,
  meter,
  onSaved,
}: {
  donorId: string
  meter: DonorMeter
  onSaved: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(String(meter.status.capacity))
  const [saving, setSaving] = React.useState(false)

  const onOpenChange = (next: boolean) => {
    if (next) setValue(String(meter.status.capacity))
    setOpen(next)
  }

  const save = async (capacity: number) => {
    setSaving(true)
    const result = await updateMeterCapacity(donorId, capacity)
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`Capacity set to ${capacity}`)
    setOpen(false)
    onSaved()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="Edit capacity">
          <Pencil className="size-3.5" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save(Number(value))
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="meter-capacity">Capacity</Label>
            <Input
              id="meter-capacity"
              type="number"
              inputMode="numeric"
              min={5}
              step={5}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Points this donor needs before an ask. Suggested from their giving: {meter.suggestedCapacity}.
            </p>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving || meter.status.capacity === meter.suggestedCapacity}
              onClick={() => void save(meter.suggestedCapacity)}
            >
              Use suggested
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

type OutcomeChoice = "gave_full" | "gave_partial" | "declined"

const OUTCOMES: Array<{ value: OutcomeChoice; label: string; hint: string }> = [
  { value: "gave_full", label: "Gave in full", hint: "The meter resets to zero." },
  { value: "gave_partial", label: "Gave less", hint: "Part of the meter is used up." },
  { value: "declined", label: "Declined", hint: "Lower the meter, or raise the capacity." },
]

const roundTo5 = (n: number) => Math.round(n / 5) * 5

type RecordAskProps = {
  donorId: string
  donorName: string
  meter: DonorMeter
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** The form is mounted only while the dialog is open, so it starts fresh each time. */
function RecordAskDialog(props: RecordAskProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">{props.open && <RecordAskForm {...props} />}</DialogContent>
    </Dialog>
  )
}

function RecordAskForm({ donorId, donorName, meter, onOpenChange, onSaved }: RecordAskProps) {
  const { fill, capacity } = meter.status
  const [choice, setChoice] = React.useState<OutcomeChoice>("gave_full")
  const [asked, setAsked] = React.useState("")
  const [given, setGiven] = React.useState("")
  const [adjust, setAdjust] = React.useState<"lower_meter" | "raise_capacity">("lower_meter")
  const [newFill, setNewFill] = React.useState(() => String(roundTo5(fill / 2)))
  const [newCapacity, setNewCapacity] = React.useState(() => String(roundTo5(capacity * 1.25)))
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const outcome: AskOutcome | null = React.useMemo(() => {
    if (choice === "gave_full") return { kind: "gave_full" }
    if (choice === "gave_partial") {
      const a = Number(asked)
      const g = Number(given)
      return asked && given && a > 0 && g >= 0 ? { kind: "gave_partial", amountAsked: a, amountGiven: g } : null
    }
    if (adjust === "lower_meter") {
      const f = Number(newFill)
      return newFill !== "" && f >= 0 ? { kind: "declined", adjust, newFill: f } : null
    }
    const c = Number(newCapacity)
    return Number.isInteger(c) && c > 0 ? { kind: "declined", adjust, newCapacity: c } : null
  }, [choice, asked, given, adjust, newFill, newCapacity])

  const after = outcome
    ? applyAskOutcome(
        { capacity, carriedPoints: 0, cycleStartedAt: meter.cycleStartedAt },
        fill,
        outcome,
        meter.cycleStartedAt
      )
    : null

  const submit = async () => {
    if (!outcome) return
    setSaving(true)
    const result = await recordAsk(donorId, {
      outcome,
      amountAsked: asked ? Number(asked) : null,
      amountGiven: choice === "gave_full" ? (asked ? Number(asked) : null) : given ? Number(given) : null,
      note,
    })
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Ask recorded")
    onOpenChange(false)
    onSaved()
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Record an ask</DialogTitle>
          <DialogDescription>
            What happened when you asked {donorName}? This starts a new cycle on their meter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Outcome" className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={choice === o.value}
                onClick={() => setChoice(o.value)}
                className={cn(
                  "rounded-md border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  choice === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{OUTCOMES.find((o) => o.value === choice)?.hint}</p>

          {choice !== "declined" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ask-amount">
                  Amount asked ($){choice === "gave_full" ? " (optional)" : ""}
                </Label>
                <Input id="ask-amount" type="number" inputMode="decimal" min={0} value={asked} onChange={(e) => setAsked(e.target.value)} />
              </div>
              {choice === "gave_partial" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ask-given">Amount given ($)</Label>
                  <Input id="ask-given" type="number" inputMode="decimal" min={0} value={given} onChange={(e) => setGiven(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {choice === "declined" && (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="Adjustment" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["lower_meter", "Lower the meter"],
                    ["raise_capacity", "Raise the capacity"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={adjust === value}
                    onClick={() => setAdjust(value)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      adjust === value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {adjust === "lower_meter" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ask-new-fill">Meter after this ask</Label>
                  <Input id="ask-new-fill" type="number" inputMode="numeric" min={0} max={fill} step={5} value={newFill} onChange={(e) => setNewFill(e.target.value)} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="ask-new-capacity">New capacity</Label>
                  <Input id="ask-new-capacity" type="number" inputMode="numeric" min={capacity} step={5} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ask-note">Note (optional)</Label>
            <Textarea id="ask-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-sm tabular-nums" aria-live="polite">
            {after ? (
              <>
                Meter: <span className="font-medium">{fill} / {capacity}</span> →{" "}
                <span className="font-medium">{after.carriedPoints} / {after.capacity}</span>
              </>
            ) : (
              "Fill in the amounts to see what happens to the meter."
            )}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!outcome || saving}>
            {saving ? "Saving…" : "Record ask"}
          </Button>
        </DialogFooter>
    </>
  )
}

/**
 * Touchpoint meter on the donor profile. Renders nothing unless the feature is
 * switched on for the organisation. `refreshKey` changes whenever the page
 * logs or edits a touchpoint, so the meter reloads.
 */
export function DonorMeterCard({
  donorId,
  donorName,
  people,
  refreshKey,
}: {
  donorId: string
  donorName: string
  people: Person[]
  refreshKey?: unknown
}) {
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "off" } | { status: "error"; error: string } | { status: "ready"; meter: DonorMeter; kinds: TouchpointKind[] }
  >({ status: "loading" })
  const [askOpen, setAskOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const result = await getMeterForDonor(donorId)
      if (!result.enabled) setState({ status: "off" })
      else if (!result.ok) setState({ status: "error", error: result.error })
      else setState({ status: "ready", meter: result.meter, kinds: result.kinds })
    } catch {
      setState({ status: "error", error: "Could not load the meter." })
    }
  }, [donorId])

  React.useEffect(() => {
    void load()
  }, [load, refreshKey])

  const peopleById = React.useMemo(() => new Map(people.map((p) => [p.user_id, p.name])), [people])

  if (state.status === "off") return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Gauge className="size-4 text-muted-foreground" strokeWidth={1.5} />
          Touchpoint meter
        </CardTitle>
        {state.status === "ready" && state.meter.status.ready && (
          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:text-emerald-950">
            <CheckCircle2 className="size-3" /> Ready to ask
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {state.status === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{state.error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums">{state.meter.status.fill}</span>
                <span className="text-sm text-muted-foreground tabular-nums">/ {state.meter.status.capacity}</span>
                <CapacityEditor donorId={donorId} meter={state.meter} onSaved={load} />
              </div>
              <Button size="sm" variant={state.meter.status.ready ? "default" : "outline"} onClick={() => setAskOpen(true)}>
                Record ask
              </Button>
            </div>

            <MeterBar meter={state.meter} kinds={state.kinds} people={peopleById} />

            {state.meter.touchpoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {state.meter.lastAsk
                  ? "New cycle. Log a touchpoint to start filling the meter again."
                  : "No touchpoints yet in this cycle. Log a call, a coffee or a visit to start filling the meter."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {state.meter.touchpoints.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {kindLabel(state.kinds, t)}
                      <span className="text-muted-foreground">
                        {" · "}
                        {shortDate(t.date)}
                        {t.createdBy && peopleById.get(t.createdBy) ? ` · ${peopleById.get(t.createdBy)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">+{t.points}</span>
                  </li>
                ))}
                {state.meter.touchpoints.length > 5 && (
                  <li className="text-xs text-muted-foreground">
                    and {state.meter.touchpoints.length - 5} more this cycle
                  </li>
                )}
              </ul>
            )}

            <RecordAskDialog
              donorId={donorId}
              donorName={donorName}
              meter={state.meter}
              open={askOpen}
              onOpenChange={setAskOpen}
              onSaved={load}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
