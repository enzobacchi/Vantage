"use client"

import * as React from "react"
import { toast } from "sonner"

import { recordAsk } from "@/app/actions/meter"
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
import { Textarea } from "@/components/ui/textarea"
import { applyAskOutcome, type AskOutcome } from "@/lib/meter/rules"
import type { DonorMeter } from "@/lib/meter/service"
import { cn } from "@/lib/utils"

/**
 * "Record an ask": how an ask went and what it does to the donor's meter.
 * Used from the donor profile and when a pipeline opportunity is closed.
 */

type OutcomeChoice = "gave_full" | "gave_partial" | "declined"

const OUTCOMES: Array<{ value: OutcomeChoice; label: string; hint: string }> = [
  { value: "gave_full", label: "Gave in full", hint: "The meter resets to zero." },
  { value: "gave_partial", label: "Gave less", hint: "Part of the meter is used up." },
  { value: "declined", label: "Declined", hint: "Lower the meter, or raise the capacity." },
]

const roundTo5 = (n: number) => Math.round(n / 5) * 5

export type RecordAskProps = {
  donorId: string
  donorName: string
  meter: Pick<DonorMeter, "status" | "cycleStartedAt">
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  /** Set when the ask comes from closing a pipeline opportunity. */
  opportunity?: { id: string; title: string; amount: number; won: boolean }
}

/** The form is mounted only while the dialog is open, so it starts fresh each time. */
export function RecordAskDialog(props: RecordAskProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">{props.open && <RecordAskForm {...props} />}</DialogContent>
    </Dialog>
  )
}

function RecordAskForm({ donorId, donorName, meter, onOpenChange, onSaved, opportunity }: RecordAskProps) {
  const { fill, capacity } = meter.status
  const [choice, setChoice] = React.useState<OutcomeChoice>(opportunity && !opportunity.won ? "declined" : "gave_full")
  const [asked, setAsked] = React.useState(opportunity && opportunity.amount > 0 ? String(opportunity.amount) : "")
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
      opportunityId: opportunity?.id ?? null,
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
            {opportunity
              ? `You closed “${opportunity.title}” as ${opportunity.won ? "won" : "lost"}. If that was an ask of ${donorName}, record how it went to start a new cycle on their meter.`
              : `What happened when you asked ${donorName}? This starts a new cycle on their meter.`}
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
            {opportunity ? "Not an ask" : "Cancel"}
          </Button>
          <Button onClick={() => void submit()} disabled={!outcome || saving}>
            {saving ? "Saving…" : "Record ask"}
          </Button>
        </DialogFooter>
    </>
  )
}
