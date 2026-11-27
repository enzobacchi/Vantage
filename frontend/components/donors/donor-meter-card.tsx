"use client"

import * as React from "react"
import { CheckCircle2, Gauge, Pencil } from "lucide-react"
import { toast } from "sonner"

import { getMeterForDonor, updateMeterCapacity } from "@/app/actions/meter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RecordAskDialog } from "@/components/meter/record-ask-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { TouchpointKind } from "@/lib/meter/rules"
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
