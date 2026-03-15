"use client"

import * as React from "react"
import { IconChevronDown, IconSearch, IconUsers } from "@tabler/icons-react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"
import { Calendar, CheckSquare, FileText, Mail, MapPin, Phone, Sparkles } from "lucide-react"

import { getDonorProfile, getDonorActivityNotes, type DonorProfileDonor, type DonorProfileDonation, type DonorNoteRow } from "@/app/donors/[id]/actions"
import { getDonorInteractions, logInteraction, toggleTaskStatus } from "@/app/actions/crm"
import { DEFAULT_LIFECYCLE_CONFIG } from "@/lib/donor-lifecycle"
import type { Interaction } from "@/types/database"
import { bulkAssignTag, bulkRemoveTag, getOrganizationTags } from "@/app/actions/tags"
import { DonorTagFilter, type TagForFilter } from "@/components/donors/donor-filters"
import { DateRangeFilter, getDateRangeFromSearchParams } from "@/components/date-range-filter"
import { format } from "date-fns"
import { SaveReportButton } from "@/components/donors/save-report-button"
import { useNav } from "@/components/nav-context"
import { DonorInsightsPanel } from "@/components/donors/donor-insights-panel"
import { MagicActionsCard } from "@/components/donors/magic-actions-card"
import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { DonorTagsCard } from "@/components/donors/donor-tags-card"
import { formatCurrency } from "@/lib/format"
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from "@/components/ui/input"
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DataTable, type DataTableRef } from "@/components/ui/data-table"
import { createDonorColumns, type Donor } from "@/components/views/donor-crm/columns"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

type SortOption = "recent" | "highest" | "lowest"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "highest", label: "Highest given" },
  { value: "lowest", label: "Lowest given" },
]

function sortDonors(donors: Donor[], sort: SortOption): Donor[] {
  const arr = [...donors]
  if (sort === "recent") {
    arr.sort((a, b) => {
      const da = a.last_donation_date ?? ""
      const db = b.last_donation_date ?? ""
      return db.localeCompare(da) // newest first
    })
  } else if (sort === "highest") {
    arr.sort((a, b) => {
      const na = toNumber(a.last_donation_amount)
      const nb = toNumber(b.last_donation_amount)
      if (na == null && nb == null) return 0
      if (na == null) return 1
      if (nb == null) return -1
      return nb - na // highest first
    })
  } else {
    // lowest
    arr.sort((a, b) => {
      const na = toNumber(a.last_donation_amount)
      const nb = toNumber(b.last_donation_amount)
      if (na == null && nb == null) return 0
      if (na == null) return 1
      if (nb == null) return -1
      return na - nb // lowest first
    })
  }
  return arr
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function interactionIcon(type: Interaction["type"]) {
  switch (type) {
    case "call":
      return <Phone className="size-4 shrink-0 text-muted-foreground" />
    case "email":
      return <Mail className="size-4 shrink-0 text-muted-foreground" />
    case "meeting":
      return <Calendar className="size-4 shrink-0 text-muted-foreground" />
    case "task":
      return <CheckSquare className="size-4 shrink-0 text-muted-foreground" />
    default:
      return <FileText className="size-4 shrink-0 text-muted-foreground" />
  }
}

function InteractionTimeline({
  donorId,
  interactions,
  onToggleTask,
  onRefresh,
}: {
  donorId: string
  interactions: Interaction[]
  onToggleTask: (id: string) => Promise<void>
  onRefresh: () => void
}) {
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const handleToggle = (id: string) => {
    setTogglingId(id)
    onToggleTask(id).finally(() => setTogglingId(null))
  }
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No interactions yet. Click &quot;Log Activity&quot; to log a call, email, or task.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {interactions.map((i) => (
        <li
          key={i.id}
          className="flex gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
        >
          <span className="mt-0.5">{interactionIcon(i.type)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {formatDateTime(i.date)}
              </span>
              {i.type === "task" && (
                <button
                  type="button"
                  onClick={() => handleToggle(i.id)}
                  disabled={togglingId === i.id}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {i.status === "completed" ? "Done" : "Mark done"}
                </button>
              )}
            </div>
            {i.subject && (
              <p className="font-medium text-foreground mt-0.5">{i.subject}</p>
            )}
            <p className="whitespace-pre-wrap text-muted-foreground mt-0.5">
              {i.content || "—"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function LogActivityDialog({
  donorId,
  donorEmail,
  defaultTab = "call",
  onLogged,
  onClose,
}: {
  donorId: string
  donorEmail: string | null
  defaultTab?: "call" | "email" | "task"
  onLogged: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = React.useState<"call" | "email" | "task">(defaultTab)
  const [subject, setSubject] = React.useState("")
  const [content, setContent] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  const reset = () => {
    setSubject("")
    setContent("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (activeTab === "email") {
      if (!subject.trim()) {
        setError("Please enter a subject.")
        return
      }
      if (!content.trim()) {
        setError("Please enter the email message.")
        return
      }
      if (!donorEmail?.trim()) {
        toast.error("This donor has no email address on file.")
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            donorEmail: donorEmail.trim(),
            subject: subject.trim(),
            message: content.trim(),
            donorId,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data?.error ?? "Failed to send email")
          setError(data?.error ?? "Failed to send email")
          return
        }
        reset()
        onLogged()
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to send email"
        toast.error(msg)
        setError(msg)
      } finally {
        setLoading(false)
      }
      return
    }

    if (activeTab === "task") {
      if (!subject.trim()) {
        setError("Please enter a task.")
        return
      }
    } else if (!content.trim()) {
      setError("Please enter notes or content.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await logInteraction({
        donor_id: donorId,
        type: activeTab,
        direction: activeTab === "task" ? undefined : "outbound",
        subject: subject.trim() || undefined,
        content: activeTab === "task" ? (content.trim() || subject.trim()) : content.trim(),
        status: activeTab === "task" ? "pending" : undefined,
      })
      reset()
      onLogged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Log Activity</DialogTitle>
      </DialogHeader>
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "call" | "email" | "task"); reset() }}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="call">Log Call</TabsTrigger>
          <TabsTrigger value="email">Send Email</TabsTrigger>
          <TabsTrigger value="task">Add Task</TabsTrigger>
        </TabsList>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <TabsContent value="call" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="call-subject">Subject (optional)</Label>
              <Input
                id="call-subject"
                className="mt-1"
                placeholder="e.g. Building fund follow-up"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="call-content">Notes</Label>
              <Textarea
                id="call-content"
                className="mt-1 min-h-[100px]"
                placeholder="e.g. Spoke to John about the building fund."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
          </TabsContent>
          <TabsContent value="email" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                className="mt-1"
                placeholder="e.g. Thank you for your gift"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email-content">Content</Label>
              <Textarea
                id="email-content"
                className="mt-1 min-h-[100px]"
                placeholder="Email body or summary…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
          </TabsContent>
          <TabsContent value="task" className="mt-0 space-y-4">
            <div>
              <Label htmlFor="task-subject">Task</Label>
              <Input
                id="task-subject"
                className="mt-1"
                placeholder="e.g. Send thank-you note"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="task-content">Notes (optional)</Label>
              <Textarea
                id="task-content"
                className="mt-1 min-h-[80px]"
                placeholder="Additional details…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          </TabsContent>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {activeTab === "email"
                ? loading
                  ? "Sending…"
                  : "Send Email"
                : loading
                  ? "Saving…"
                  : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </Tabs>
    </DialogContent>
  )
}

export function DonorCRMView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { selectedDonorId, clearSelectedDonor } = useNav()
  const [donors, setDonors] = React.useState<Donor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<SortOption>("recent")
  const [selectedDonors, setSelectedDonors] = React.useState<Donor[]>([])
  const [bulkTagOpen, setBulkTagOpen] = React.useState<"add" | "remove" | null>(null)
  const [bulkTagSaving, setBulkTagSaving] = React.useState(false)
  const dataTableRef = React.useRef<DataTableRef<Donor> | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  const [orgTags, setOrgTags] = React.useState<TagForFilter[]>([])
  const [selectedTagIds, setSelectedTagIds] = React.useState<Set<string>>(new Set())
  const [tagFilterPopoverOpen, setTagFilterPopoverOpen] = React.useState(false)

  React.useEffect(() => {
    getOrganizationTags().then(setOrgTags).catch(() => {})
  }, [])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetDonorId, setSheetDonorId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (selectedDonorId) {
      setSheetDonorId(selectedDonorId)
      setSheetOpen(true)
      clearSelectedDonor()
    }
  }, [selectedDonorId, clearSelectedDonor])

  // Handle /donors/[id] redirect: URL has donorId param → open sheet and clear param
  const donorIdFromUrl = searchParams.get("donorId")
  React.useEffect(() => {
    if (donorIdFromUrl && pathname === "/dashboard") {
      setSheetDonorId(donorIdFromUrl)
      setSheetOpen(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete("donorId")
      const q = params.toString()
      router.replace(q ? `/dashboard?${q}` : "/dashboard?view=donor-crm", { scroll: false })
    }
  }, [donorIdFromUrl, pathname, searchParams, router])
  const [sheetProfile, setSheetProfile] = React.useState<{ donor: DonorProfileDonor; donations: DonorProfileDonation[] } | null>(null)
  const [sheetActivity, setSheetActivity] = React.useState<DonorNoteRow[]>([])
  const [sheetInteractions, setSheetInteractions] = React.useState<Interaction[]>([])
  const [sheetLoading, setSheetLoading] = React.useState(false)
  const [logActivityOpen, setLogActivityOpen] = React.useState(false)
  const [logActivityDefaultTab, setLogActivityDefaultTab] = React.useState<"call" | "email" | "task">("call")
  const [historyOpen, setHistoryOpen] = React.useState(false)

  const loadDonors = React.useCallback(async (tagIds?: Set<string>, dateRange?: { from?: string; to?: string }) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (tagIds && tagIds.size > 0) params.set("tagIds", [...tagIds].join(","))
      if (dateRange?.from) params.set("from", dateRange.from)
      if (dateRange?.to) params.set("to", dateRange.to)
      const q = params.toString()
      const url = q ? `/api/donors?${q}` : "/api/donors"
      const res = await fetch(url)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
        throw new Error(msg || `Failed to load donors (HTTP ${res.status}).`)
      }
      setDonors(Array.isArray(data) ? (data as Donor[]) : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load donors.")
    } finally {
      setLoading(false)
    }
  }, [])

  const dateRange = React.useMemo(() => getDateRangeFromSearchParams(searchParams), [searchParams])

  React.useEffect(() => {
    loadDonors(selectedTagIds, dateRange)
  }, [selectedTagIds, dateRange.from, dateRange.to, loadDonors])

  const handleTagFilterChange = React.useCallback(
    (next: Set<string>) => {
      setSelectedTagIds(next)
    },
    []
  )

  const sortedDonors = React.useMemo(() => {
    let list = sortDonors(donors, sortBy)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((d) =>
        (d.display_name ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [donors, sortBy, searchQuery])

  const openDonorSheet = React.useCallback((donorId: string) => {
    setSheetDonorId(donorId)
    setSheetOpen(true)
  }, [])

  const donorColumns = React.useMemo(
    () => createDonorColumns({ onOpenDonorSheet: openDonorSheet }),
    [openDonorSheet]
  )

  const handleBulkAddTag = React.useCallback(
    async (tagId: string) => {
      if (selectedDonors.length === 0) return
      setBulkTagSaving(true)
      try {
        const count = await bulkAssignTag(
          selectedDonors.map((d) => d.id),
          tagId
        )
        toast.success(`Tag added to ${count} donor${count === 1 ? "" : "s"}`)
        setBulkTagOpen(null)
        dataTableRef.current?.clearSelection()
        loadDonors(selectedTagIds, dateRange)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add tag")
      } finally {
        setBulkTagSaving(false)
      }
    },
    [selectedDonors, selectedTagIds, dateRange, loadDonors]
  )

  const handleBulkRemoveTag = React.useCallback(
    async (tagId: string) => {
      if (selectedDonors.length === 0) return
      setBulkTagSaving(true)
      try {
        const count = await bulkRemoveTag(
          selectedDonors.map((d) => d.id),
          tagId
        )
        toast.success(`Tag removed from ${count} donor${count === 1 ? "" : "s"}`)
        setBulkTagOpen(null)
        dataTableRef.current?.clearSelection()
        loadDonors(selectedTagIds, dateRange)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove tag")
      } finally {
        setBulkTagSaving(false)
      }
    },
    [selectedDonors, selectedTagIds, dateRange, loadDonors]
  )

  React.useEffect(() => {
    if (!sheetOpen || !sheetDonorId) {
      setSheetProfile(null)
      setSheetActivity([])
      setSheetInteractions([])
      return
    }
    let cancelled = false
    setSheetLoading(true)
    Promise.all([
      getDonorProfile(sheetDonorId),
      getDonorActivityNotes(sheetDonorId),
      getDonorInteractions(sheetDonorId),
    ])
      .then(([profile, activity, interactions]) => {
        if (cancelled) return
        if (profile.donor) {
          setSheetProfile({ donor: profile.donor, donations: profile.donations })
          setSheetActivity(activity)
          setSheetInteractions(interactions)
        } else {
          setSheetProfile(null)
          setSheetActivity([])
          setSheetInteractions([])
        }
      })
      .catch(() => {
        if (!cancelled) setSheetProfile(null)
      })
      .finally(() => {
        if (!cancelled) setSheetLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sheetOpen, sheetDonorId])

  const closeSheet = React.useCallback(() => {
    setSheetOpen(false)
    setSheetDonorId(null)
    setHistoryOpen(false)
  }, [])
  const emptyMessage = searchQuery.trim()
    ? "No donors match your search."
    : selectedTagIds.size > 0
      ? "No donors have the selected tags."
      : "No donors found."

  return (
    <div className="flex flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <IconUsers className="size-5 text-slate-900 dark:text-white" />
        <h1 className="text-xl font-semibold">Donor CRM</h1>
      </div>

      <Card className="mx-4 lg:mx-6">
        <CardHeader>
          <CardTitle>All Donors</CardTitle>
          <CardDescription>
            Manage your donor relationships and track giving history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search donors by name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <DateRangeFilter
              onRangeChange={(range) => {
                const next =
                  range?.from && range?.to
                    ? { from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") }
                    : {}
                loadDonors(selectedTagIds, next)
              }}
            />
            <DonorTagFilter
              tags={orgTags}
              selectedTagIds={selectedTagIds}
              onSelectedTagIdsChange={handleTagFilterChange}
              open={tagFilterPopoverOpen}
              onOpenChange={(open) => {
                if (open) getOrganizationTags().then(setOrgTags).catch(() => {})
                setTagFilterPopoverOpen(open)
              }}
            />
            <SaveReportButton
              searchQuery={searchQuery}
              selectedTagIds={selectedTagIds}
              visibleBadges={new Set()}
              badgeConfig={DEFAULT_LIFECYCLE_CONFIG}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="donor-sort" className="text-sm font-medium whitespace-nowrap">
                Sort by
              </Label>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortOption)}
              >
                <SelectTrigger id="donor-sort" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedDonors.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2">
              <span className="text-sm font-medium">
                {selectedDonors.length} selected
              </span>
              <Popover
                open={bulkTagOpen === "add"}
                onOpenChange={(open) =>
                  setBulkTagOpen(open ? "add" : null)
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkTagSaving || orgTags.length === 0}
                  >
                    Add tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex flex-col gap-1">
                    {orgTags.map((tag) => (
                      <Button
                        key={tag.id}
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() => void handleBulkAddTag(tag.id)}
                        disabled={bulkTagSaving}
                      >
                        {tag.name}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover
                open={bulkTagOpen === "remove"}
                onOpenChange={(open) =>
                  setBulkTagOpen(open ? "remove" : null)
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkTagSaving || orgTags.length === 0}
                  >
                    Remove tag
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex flex-col gap-1">
                    {orgTags.map((tag) => (
                      <Button
                        key={tag.id}
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() => void handleBulkRemoveTag(tag.id)}
                        disabled={bulkTagSaving}
                      >
                        {tag.name}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dataTableRef.current?.clearSelection()}
              >
                Clear selection
              </Button>
            </div>
          )}

          <DataTable<Donor, unknown>
            columns={donorColumns}
            data={sortedDonors}
            loading={loading}
            error={error}
            emptyMessage={emptyMessage}
            onRowSelectionChange={setSelectedDonors}
            onRowClick={(row) => openDonorSheet(row.id)}
            tableRef={dataTableRef}
            getRowClassName={(row) =>
              row.id === sheetDonorId ? "bg-primary/10 hover:bg-primary/10" : undefined
            }
          />
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent
          side="right"
          className="flex flex-col w-full sm:max-w-xl p-0 gap-0 overflow-hidden"
        >
          {/* Header */}
          <SheetHeader className="shrink-0 border-b bg-muted/30 px-6 py-4 text-left">
            <SheetTitle className="text-xl font-bold tracking-tight truncate">
              {sheetProfile?.donor?.display_name ?? "Donor"}
            </SheetTitle>
          </SheetHeader>

          {/* Scrollable body */}
          {sheetLoading && (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          )}
          {!sheetLoading && sheetProfile?.donor && sheetDonorId && (
            (() => {
              const donations = sheetProfile.donations
              const now = new Date()
              const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
              const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
              const toAmount = (d: DonorProfileDonation) => {
                if (d.amount == null) return 0
                const n = typeof d.amount === "number" ? d.amount : Number(d.amount)
                return Number.isFinite(n) ? n : 0
              }
              const lifetimeSum = donations.reduce((sum, d) => sum + toAmount(d), 0)
              const ytdSum = donations
                .filter((d) => d.date != null && d.date >= yearStartStr)
                .reduce((sum, d) => sum + toAmount(d), 0)
              const thisMonthSum = donations
                .filter((d) => d.date != null && d.date >= monthStartStr)
                .reduce((sum, d) => sum + toAmount(d), 0)
              return (
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                  {/* AI donor briefing + stats + contact — single column for compact panel */}
                  <div className="space-y-4">
                    <DonorInsightsPanel donorId={sheetProfile.donor.id} />

                    <div className="grid grid-cols-3 divide-x border rounded-lg">
                      <div className="flex flex-col items-center justify-center px-1 py-3">
                        <span className="text-[10px] text-muted-foreground text-center">Lifetime</span>
                        <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(lifetimeSum)}</span>
                      </div>
                      <div className="flex flex-col items-center justify-center px-1 py-3">
                        <span className="text-[10px] text-muted-foreground text-center">YTD</span>
                        <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(ytdSum)}</span>
                      </div>
                      <div className="flex flex-col items-center justify-center px-1 py-3">
                        <span className="text-[10px] text-muted-foreground text-center">This Month</span>
                        <span className="text-sm font-semibold tabular-nums mt-0.5">{formatCurrency(thisMonthSum)}</span>
                      </div>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Contact</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-3">
                          <li className="flex items-center gap-2.5">
                            <Mail className="size-4 shrink-0 text-muted-foreground" />
                            {sheetProfile.donor.email ? (
                              <a
                                href={`mailto:${sheetProfile.donor.email}`}
                                className="truncate text-sm text-primary hover:underline"
                              >
                                {sheetProfile.donor.email}
                              </a>
                            ) : (
                              <span className="truncate text-sm">—</span>
                            )}
                          </li>
                          <li className="flex items-center gap-2.5">
                            <Phone className="size-4 shrink-0 text-muted-foreground" />
                            <span className="text-sm">{sheetProfile.donor.phone ?? "—"}</span>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <MapPin className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                            <span className="text-sm text-muted-foreground">{sheetProfile.donor.billing_address ?? "—"}</span>
                          </li>
                        </ul>
                      </CardContent>
                    </Card>

                    <MagicActionsCard
                      donorId={sheetDonorId}
                      donorName={sheetProfile.donor.display_name ?? "Unknown Donor"}
                      compact
                      onSendEmail={() => {
                        setLogActivityDefaultTab("email")
                        setLogActivityOpen(true)
                      }}
                      onLogCall={() => {
                        setLogActivityDefaultTab("call")
                        setLogActivityOpen(true)
                      }}
                    />

                    <DonorTagsCard donorId={sheetDonorId} />
                    <DonorNotesCard
                      donorId={sheetDonorId}
                      initialNotes={sheetProfile.donor.notes}
                      savedNotes={sheetActivity}
                    />
                  </div>

                  {/* Log Activity dialog — state-controlled, no nested trigger */}
                  <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
                    <LogActivityDialog
                      donorId={sheetDonorId}
                      donorEmail={sheetProfile?.donor?.email ?? null}
                      defaultTab={logActivityDefaultTab}
                      onLogged={() => {
                        getDonorInteractions(sheetDonorId).then(setSheetInteractions)
                        setLogActivityOpen(false)
                      }}
                      onClose={() => setLogActivityOpen(false)}
                    />
                  </Dialog>

                  {/* Bottom: history — collapsed by default */}
                  <div className="border rounded-lg overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setHistoryOpen((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setHistoryOpen((v) => !v)
                        }
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">History</span>
                        <span className="text-xs text-muted-foreground">
                          {sheetProfile.donations.length} gift{sheetProfile.donations.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); setLogActivityOpen(true) }}
                        >
                          Log Activity
                        </Button>
                        <IconChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
                      </div>
                    </div>

                    {historyOpen && (
                      <div className="border-t max-h-[300px] overflow-y-auto">
                        <Tabs defaultValue="giving" className="w-full">
                          <TabsList className="grid w-full grid-cols-2 rounded-none border-b h-9">
                            <TabsTrigger value="giving" className="rounded-none text-xs">Giving History</TabsTrigger>
                            <TabsTrigger value="timeline" className="rounded-none text-xs">Timeline</TabsTrigger>
                          </TabsList>
                          <TabsContent value="giving" className="mt-0 p-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                  <TableHead>Memo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sheetProfile.donations.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={3} className="text-muted-foreground text-center py-4 text-sm">
                                      No donations recorded.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  sheetProfile.donations.map((d) => (
                                    <TableRow key={d.id}>
                                      <TableCell className="font-medium text-sm">{formatDate(d.date)}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm">{formatCurrency(d.amount)}</TableCell>
                                      <TableCell className="text-muted-foreground max-w-[300px] truncate text-sm">
                                        {d.memo && !/^qb_sales_receipt_id:/i.test(d.memo) ? d.memo : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </TabsContent>
                          <TabsContent value="timeline" className="mt-0 p-3">
                            <InteractionTimeline
                              donorId={sheetDonorId}
                              interactions={sheetInteractions}
                              onToggleTask={async (id) => {
                                await toggleTaskStatus(id)
                                getDonorInteractions(sheetDonorId).then(setSheetInteractions)
                              }}
                              onRefresh={() => getDonorInteractions(sheetDonorId).then(setSheetInteractions)}
                            />
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
