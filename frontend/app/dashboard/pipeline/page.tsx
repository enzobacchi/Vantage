"use client"

import * as React from "react"
import {
  DndContext,
  DragOverEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { IconPlus, IconTrendingUp } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  getPipeline,
  updateOpportunityStatus,
  type OpportunityStatus,
  type PipelineOpportunity,
} from "@/app/actions/pipeline"
import type { SearchDonorResult } from "@/app/actions/search"

// Status list defined locally; do not import from "use server" (becomes a server reference, not an array)
const PIPELINE_STATUSES: OpportunityStatus[] = [
  "identified",
  "qualified",
  "solicited",
  "committed",
  "closed_won",
  "closed_lost",
]
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

const COLUMN_LABELS: Record<OpportunityStatus, string> = {
  identified: "To Contact",
  qualified: "Qualified",
  solicited: "Solicited",
  committed: "Committed",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  try {
    return new Date(value + "T00:00:00Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

function KanbanCard({
  opportunity,
}: {
  opportunity: PipelineOpportunity
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opportunity.id,
    data: { opportunity },
  })

  const donorName =
    opportunity.donor?.display_name?.trim() || "Unknown Donor"

  return (
    <Card
      ref={setNodeRef}
      className={`cursor-grab rounded-lg border bg-card shadow-xs active:cursor-grabbing ${isDragging ? "opacity-80 shadow-md" : ""}`}
      {...listeners}
      {...attributes}
    >
      <CardContent className="p-3">
        <p className="font-medium text-foreground truncate">{donorName}</p>
        <p className="text-sm text-muted-foreground truncate">
          {opportunity.title}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums">
          {formatCurrency(opportunity.amount)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(opportunity.expected_date)}
        </p>
      </CardContent>
    </Card>
  )
}

function KanbanColumn({
  status,
  opportunities,
}: {
  status: OpportunityStatus
  opportunities: PipelineOpportunity[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[200px] max-w-[220px] flex-col rounded-lg border bg-muted/30 p-2 transition-colors ${isOver ? "ring-2 ring-primary/50" : ""}`}
    >
      <h3 className="mb-2 px-1 text-sm font-semibold text-foreground">
        {COLUMN_LABELS[status]}
      </h3>
      <p className="mb-2 px-1 text-xs text-muted-foreground">
        {opportunities.length} deal{opportunities.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {opportunities.map((opp) => (
          <KanbanCard key={opp.id} opportunity={opp} />
        ))}
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const [opportunities, setOpportunities] = React.useState<PipelineOpportunity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [newOpen, setNewOpen] = React.useState(false)
  const [newDonorId, setNewDonorId] = React.useState("")
  const [newDonorDisplayName, setNewDonorDisplayName] = React.useState<string>("")
  const [donorSearchQuery, setDonorSearchQuery] = React.useState("")
  const [donorSearchResults, setDonorSearchResults] = React.useState<SearchDonorResult[]>([])
  const [donorSearching, setDonorSearching] = React.useState(false)
  const [donorPopoverOpen, setDonorPopoverOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [newAmount, setNewAmount] = React.useState("")
  const [newStatus, setNewStatus] = React.useState<OpportunityStatus>("identified")
  const [newExpectedDate, setNewExpectedDate] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const donorSearchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (donorSearchDebounceRef.current) clearTimeout(donorSearchDebounceRef.current)
    const q = donorSearchQuery.trim()
    if (!q) {
      setDonorSearchResults([])
      return
    }
    donorSearchDebounceRef.current = setTimeout(() => {
      setDonorSearching(true)
      fetch(`/api/donors/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((arr: SearchDonorResult[]) => setDonorSearchResults(Array.isArray(arr) ? arr : []))
        .catch(() => setDonorSearchResults([]))
        .finally(() => setDonorSearching(false))
    }, 200)
    return () => {
      if (donorSearchDebounceRef.current) clearTimeout(donorSearchDebounceRef.current)
    }
  }, [donorSearchQuery])

  const loadPipeline = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await getPipeline()
      setOpportunities(list)
    } catch {
      // If refetch fails (e.g. server action error), keep current state so optimistic cards aren’t wiped
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadPipeline()
  }, [loadPipeline])

  const opportunitiesByStatus = React.useMemo(() => {
    const map: Record<OpportunityStatus, PipelineOpportunity[]> = {
      identified: [],
      qualified: [],
      solicited: [],
      committed: [],
      closed_won: [],
      closed_lost: [],
    }
    for (const opp of opportunities) {
      if (map[opp.status]) map[opp.status].push(opp)
    }
    return map
  }, [opportunities])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragOver = (event: DragOverEvent) => {
    // Optional: visual feedback during drag
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || over.id === active.id) return

    const oppId = active.id as string
    const overId = over.id as string

    const isColumn = PIPELINE_STATUSES.includes(overId as OpportunityStatus)
    if (!isColumn) return

    const newStatus = overId as OpportunityStatus
    const prev = opportunities.find((o) => o.id === oppId)
    if (!prev || prev.status === newStatus) return

    setOpportunities((prevList) =>
      prevList.map((o) =>
        o.id === oppId ? { ...o, status: newStatus } : o
      )
    )

    const result = await updateOpportunityStatus(oppId, newStatus)
    if (!result.ok) {
      setOpportunities((prevList) =>
        prevList.map((o) => (o.id === oppId ? { ...o, status: prev.status } : o))
      )
      toast.error("Failed to update", { description: result.error })
    }
  }

  const openNewDialog = () => {
    setNewDonorId("")
    setNewDonorDisplayName("")
    setDonorSearchQuery("")
    setDonorSearchResults([])
    setNewTitle("")
    setNewAmount("")
    setNewStatus("identified")
    setNewExpectedDate("")
    setDonorPopoverOpen(false)
    setNewOpen(true)
  }

  const selectDonor = (d: SearchDonorResult) => {
    setNewDonorId(d.id)
    setNewDonorDisplayName(d.display_name?.trim() ?? "Unknown")
    setDonorPopoverOpen(false)
    setDonorSearchQuery("")
    setDonorSearchResults([])
  }

  const clearDonor = () => {
    setNewDonorId("")
    setNewDonorDisplayName("")
    setDonorSearchQuery("")
    setDonorSearchResults([])
  }

  const handleCreate = async () => {
    const donorId = newDonorId.trim()
    const amount = parseFloat(newAmount)
    if (!donorId || !Number.isFinite(amount) || amount < 0) {
      toast.error("Select a donor and enter a valid amount")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/pipeline/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donor_id: donorId,
          title: newTitle.trim() || undefined,
          amount,
          status: newStatus,
          expected_date: newExpectedDate.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.id) {
        toast.success("Opportunity added")
        setNewOpen(false)
        const newOpp: PipelineOpportunity = {
          id: data.id,
          organization_id: "",
          donor_id: donorId,
          title: newTitle.trim() || "Opportunity",
          amount,
          status: newStatus,
          expected_date: newExpectedDate.trim() || null,
          created_at: new Date().toISOString(),
          donor: { display_name: newDonorDisplayName || null },
        }
        setOpportunities((prev) => [newOpp, ...prev])
        await loadPipeline()
      } else {
        toast.error("Could not create", { description: data.error ?? res.statusText })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <IconTrendingUp className="size-5 text-slate-900 dark:text-white" />
          <h1 className="text-xl font-semibold">Pipeline</h1>
        </div>
        <Button
          className="bg-slate-900 hover:bg-slate-800 text-white"
          onClick={openNewDialog}
        >
          <IconPlus className="mr-2 size-4" />
          New Opportunity
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto px-4 lg:px-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading pipeline…</p>
        ) : (
          <DndContext
            sensors={sensors}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 pb-4">
              {PIPELINE_STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  opportunities={opportunitiesByStatus[status]}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Opportunity</DialogTitle>
            <DialogDescription>
              Add a deal to the pipeline. You can move it between stages by dragging.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-donor">Donor</Label>
              <Popover open={donorPopoverOpen} onOpenChange={setDonorPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="new-donor"
                    variant="outline"
                    role="combobox"
                    aria-expanded={donorPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {newDonorId ? (
                      <span className="truncate">{newDonorDisplayName}</span>
                    ) : (
                      <span className="text-muted-foreground">Search for a donor…</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="flex flex-col">
                    <Input
                      placeholder="Type name or email to search…"
                      value={donorSearchQuery}
                      onChange={(e) => setDonorSearchQuery(e.target.value)}
                      className="rounded-b-none border-0 border-b"
                      autoFocus
                    />
                    <div className="max-h-[220px] overflow-y-auto">
                      {donorSearching && (
                        <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                      )}
                      {!donorSearching && !donorSearchQuery.trim() && (
                        <p className="p-3 text-sm text-muted-foreground">Type to find donors by name or email.</p>
                      )}
                      {!donorSearching && donorSearchQuery.trim() && donorSearchResults.length === 0 && (
                        <p className="p-3 text-sm text-muted-foreground">No donors found. Try a different search.</p>
                      )}
                      {!donorSearching &&
                        donorSearchResults.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                            onClick={() => selectDonor(d)}
                          >
                            <span className="font-medium">{d.display_name ?? "Unknown"}</span>
                            {d.total_lifetime_value != null && (
                              <span className="ml-2 text-muted-foreground">
                                {typeof d.total_lifetime_value === "number"
                                  ? formatCurrency(d.total_lifetime_value)
                                  : String(d.total_lifetime_value)}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {newDonorId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground -mt-1"
                  onClick={clearDonor}
                >
                  Clear selection
                </Button>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-title">Title (optional)</Label>
              <Input
                id="new-title"
                placeholder="e.g. End of Year Ask"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-amount">Amount ($)</Label>
              <Input
                id="new-amount"
                type="number"
                min={0}
                step={100}
                placeholder="50000"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-status">Stage</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as OpportunityStatus)}
              >
                <SelectTrigger id="new-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {COLUMN_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-date">Expected date (optional)</Label>
              <Input
                id="new-date"
                type="date"
                value={newExpectedDate}
                onChange={(e) => setNewExpectedDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} className="bg-transparent">
              Cancel
            </Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800 text-white"
              onClick={() => void handleCreate()}
              disabled={submitting || !newDonorId.trim() || !newAmount.trim()}
            >
              {submitting ? "Adding…" : "Add Opportunity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
