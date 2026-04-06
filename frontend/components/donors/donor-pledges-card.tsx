"use client"

import * as React from "react"
import { toast } from "sonner"
import { HandCoins, Plus, Trash2 } from "lucide-react"

import {
  getDonorPledges,
  createPledge,
  updatePledge,
  deletePledge,
  type Pledge,
  type PledgeFrequency,
  type PledgeStatus,
} from "@/app/actions/pledges"
import { formatFrequency, getPledgeProgress } from "@/lib/pledge-helpers"
import { formatCurrency } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function statusColor(status: PledgeStatus) {
  switch (status) {
    case "active": return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
    case "fulfilled": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
    case "overdue": return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
    case "cancelled": return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted/50 w-full">
      <div
        className={cn("h-full rounded-full transition-all", {
          "bg-emerald-500": value >= 100,
          "bg-blue-500": value >= 50 && value < 100,
          "bg-amber-500": value >= 25 && value < 50,
          "bg-red-500": value < 25,
        })}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

/* ───── Create Pledge Dialog ───── */

function CreatePledgeDialog({
  donorId,
  open,
  onOpenChange,
  onCreated,
}: {
  donorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [amount, setAmount] = React.useState("")
  const [frequency, setFrequency] = React.useState<PledgeFrequency>("one_time")
  const [startDate, setStartDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }
    setSaving(true)
    try {
      const result = await createPledge({
        donor_id: donorId,
        amount: numAmount,
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        notes: notes || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Pledge created")
      onOpenChange(false)
      setAmount("")
      setFrequency("one_time")
      setNotes("")
      setEndDate("")
      onCreated()
    } catch {
      toast.error("Failed to create pledge")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Pledge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pledge-amount">Amount</Label>
              <Input
                id="pledge-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="1,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pledge-frequency">Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as PledgeFrequency)}>
                <SelectTrigger id="pledge-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pledge-start">Start Date</Label>
              <Input
                id="pledge-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pledge-end">End Date (optional)</Label>
              <Input
                id="pledge-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pledge-notes">Notes (optional)</Label>
            <Textarea
              id="pledge-notes"
              placeholder="e.g. Building fund commitment, 2-year pledge"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Pledge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ───── Pledge Card ───── */

export function DonorPledgesCard({ donorId }: { donorId: string }) {
  const [pledges, setPledges] = React.useState<Pledge[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)

  const loadPledges = React.useCallback(async () => {
    try {
      const data = await getDonorPledges(donorId)
      setPledges(data)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [donorId])

  React.useEffect(() => {
    loadPledges()
  }, [loadPledges])

  const handleStatusChange = async (pledgeId: string, newStatus: PledgeStatus) => {
    const result = await updatePledge(pledgeId, { status: newStatus })
    if (result.ok) {
      toast.success(`Pledge marked as ${newStatus}`)
      loadPledges()
    } else {
      toast.error(result.error)
    }
  }

  const handleDelete = async (pledgeId: string) => {
    const result = await deletePledge(pledgeId)
    if (result.ok) {
      toast.success("Pledge removed")
      loadPledges()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <HandCoins className="size-4" strokeWidth={1.5} />
            Pledges
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : pledges.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground">No pledges yet</p>
              <Button
                variant="link"
                size="sm"
                className="text-xs mt-1 h-auto p-0"
                onClick={() => setCreateOpen(true)}
              >
                Add a pledge
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {pledges.map((pledge) => {
                const progress = getPledgeProgress(pledge)
                return (
                  <li
                    key={pledge.id}
                    className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(pledge.amount)}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0 border-0", statusColor(pledge.status))}
                        >
                          {pledge.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {pledge.status === "active" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Mark fulfilled"
                            onClick={() => handleStatusChange(pledge.id, "fulfilled")}
                          >
                            <span className="text-[10px]">&#10003;</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(pledge.id)}
                        >
                          <Trash2 className="size-3" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatFrequency(pledge.frequency)}</span>
                      <span>
                        {formatCurrency(pledge.amount_received ?? 0)} of{" "}
                        {formatCurrency(pledge.amount)} ({progress}%)
                      </span>
                    </div>
                    <ProgressBar value={progress} />
                    {pledge.notes && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {pledge.notes}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(pledge.start_date)}
                      {pledge.end_date ? ` – ${formatDate(pledge.end_date)}` : ""}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreatePledgeDialog
        donorId={donorId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadPledges}
      />
    </>
  )
}
