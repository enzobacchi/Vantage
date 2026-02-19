"use client"

import * as React from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Calendar, CheckSquare, FileText, Mail, MapPin, Phone, Star } from "lucide-react"

import { getDonorProfile, getDonorActivityNotes, type DonorProfileDonor, type DonorProfileDonation, type DonorNoteRow } from "@/app/donors/[id]/actions"
import { getDonorInteractions, logInteraction, toggleTaskStatus } from "@/app/actions/crm"
import { getDonorLifecycleStatus, DEFAULT_LIFECYCLE_CONFIG, type LifecycleStatus, type LifecycleConfig } from "@/lib/donor-lifecycle"
import type { Interaction } from "@/types/database"
import { getOrganizationTags } from "@/app/actions/tags"
import { DonorBadges, DonorTagFilter, DEFAULT_BADGE_CONFIG, type TagForFilter } from "@/components/donors/donor-filters"
import { SaveReportButton } from "@/components/donors/save-report-button"
import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { useNav } from "@/components/nav-context"
import { MagicActionsCard } from "@/components/donors/magic-actions-card"
import { DonorTagsCard } from "@/components/donors/donor-tags-card"
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from "@/components/ui/input"
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type DonorTag = { id: string; name: string; color: string }

type Donor = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
  last_donation_amount: number | string | null
  last_donation_date: string | null
  first_donation_date?: string | null
  billing_address: string | null
  state: string | null
  notes: string | null
  tags?: DonorTag[]
}

const LIFECYCLE_BADGE_CLASS: Record<LifecycleStatus, string> = {
  New: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0",
  Active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-0",
  Lapsed: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-0",
  Lost: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-0",
}

function LifecycleBadges({
  status,
  isMajor,
  visibleBadges,
  className,
}: {
  status: LifecycleStatus
  isMajor: boolean
  /** When set, only show badges that are in this set. When empty, show nothing. */
  visibleBadges?: Set<string> | null
  className?: string
}) {
  const showStatus = visibleBadges == null ? true : visibleBadges.size === 0 ? false : visibleBadges.has(status)
  const showMajor = isMajor && (visibleBadges == null ? true : visibleBadges.size === 0 ? false : visibleBadges.has("Major"))
  if (!showStatus && !showMajor) return <span className={className ?? ""}>—</span>
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {showStatus && (
        <Badge variant="secondary" className={LIFECYCLE_BADGE_CLASS[status]}>
          {status}
        </Badge>
      )}
      {showMajor && (
        <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-0 gap-1">
          <Star className="size-3" />
          Major
        </Badge>
      )}
    </span>
  )
}

function formatCurrency(value: number | string | null | undefined) {
  if (value == null) return "—"
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

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

function parseFilterFromUrl(searchParams: URLSearchParams): {
  visibleBadges: Set<string>
  badgeConfig: LifecycleConfig
} {
  const status = searchParams.get("status")
  const visibleBadges = new Set<string>(
    status ? status.split(",").map((s) => s.trim()).filter(Boolean) : []
  )
  const newMonths = searchParams.get("newMonths")
  const lapsedMonths = searchParams.get("lapsedMonths")
  const minMajor = searchParams.get("minMajor")
  const badgeConfig: LifecycleConfig = {
    newDonorMonths: newMonths != null && newMonths !== "" ? parseInt(newMonths, 10) : undefined,
    lapsedMonths: lapsedMonths != null && lapsedMonths !== "" ? parseInt(lapsedMonths, 10) : undefined,
    majorDonorThreshold: minMajor != null && minMajor !== "" ? parseInt(minMajor, 10) : undefined,
  }
  return { visibleBadges, badgeConfig }
}

function buildFilterUrl(visibleBadges: Set<string>, badgeConfig: LifecycleConfig): string {
  const p = new URLSearchParams()
  if (visibleBadges.size > 0) {
    p.set("status", [...visibleBadges].sort().join(","))
  }
  if (badgeConfig.newDonorMonths != null && badgeConfig.newDonorMonths !== DEFAULT_BADGE_CONFIG.newDonorMonths) {
    p.set("newMonths", String(badgeConfig.newDonorMonths))
  }
  if (badgeConfig.lapsedMonths != null && badgeConfig.lapsedMonths !== DEFAULT_BADGE_CONFIG.lapsedMonths) {
    p.set("lapsedMonths", String(badgeConfig.lapsedMonths))
  }
  if (badgeConfig.majorDonorThreshold != null && badgeConfig.majorDonorThreshold !== DEFAULT_BADGE_CONFIG.majorDonorThreshold) {
    p.set("minMajor", String(badgeConfig.majorDonorThreshold))
  }
  const q = p.toString()
  return q ? `?${q}` : ""
}

export function DonorCRMView() {
  const searchParams = useSearchParams()
  const { selectedDonorId, clearSelectedDonor } = useNav()
  const [donors, setDonors] = React.useState<Donor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  const [sortBy, setSortBy] = React.useState<SortOption>("recent")
  const [searchQuery, setSearchQuery] = React.useState("")

  const [visibleBadges, setVisibleBadges] = React.useState<Set<string>>(() =>
    parseFilterFromUrl(searchParams).visibleBadges
  )
  const [badgeConfig, setBadgeConfig] = React.useState<LifecycleConfig>(() => {
    const parsed = parseFilterFromUrl(searchParams).badgeConfig
    return {
      newDonorMonths: parsed.newDonorMonths ?? DEFAULT_LIFECYCLE_CONFIG.newDonorMonths,
      lapsedMonths: parsed.lapsedMonths ?? DEFAULT_LIFECYCLE_CONFIG.lapsedMonths,
      lostMonths: parsed.lostMonths ?? DEFAULT_LIFECYCLE_CONFIG.lostMonths,
      majorDonorThreshold: parsed.majorDonorThreshold ?? DEFAULT_LIFECYCLE_CONFIG.majorDonorThreshold,
    }
  })
  const [badgesPopoverOpen, setBadgesPopoverOpen] = React.useState(false)
  const [orgTags, setOrgTags] = React.useState<TagForFilter[]>([])
  const [selectedTagIds, setSelectedTagIds] = React.useState<Set<string>>(new Set())
  const [tagFilterPopoverOpen, setTagFilterPopoverOpen] = React.useState(false)
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    getOrganizationTags().then(setOrgTags).catch(() => {})
  }, [])

  React.useEffect(() => {
    const q = buildFilterUrl(visibleBadges, badgeConfig)
    const current = typeof window !== "undefined" ? window.location.search : ""
    const desired = q === "" ? "" : q.slice(1)
    const currentNorm = current.startsWith("?") ? current.slice(1) : current
    if (currentNorm !== desired) {
      router.replace(pathname + (q || ""), { scroll: false })
    }
  }, [visibleBadges, badgeConfig, pathname, router])

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetDonorId, setSheetDonorId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (selectedDonorId) {
      setSheetDonorId(selectedDonorId)
      setSheetOpen(true)
      clearSelectedDonor()
    }
  }, [selectedDonorId, clearSelectedDonor])
  const [sheetProfile, setSheetProfile] = React.useState<{ donor: DonorProfileDonor; donations: DonorProfileDonation[] } | null>(null)
  const [sheetActivity, setSheetActivity] = React.useState<DonorNoteRow[]>([])
  const [sheetInteractions, setSheetInteractions] = React.useState<Interaction[]>([])
  const [sheetLoading, setSheetLoading] = React.useState(false)
  const [logActivityOpen, setLogActivityOpen] = React.useState(false)
  const [logActivityDefaultTab, setLogActivityDefaultTab] = React.useState<"call" | "email" | "task">("call")

  const loadDonors = React.useCallback(async (tagIds?: Set<string>) => {
    try {
      setLoading(true)
      setError(null)
      const url =
        tagIds && tagIds.size > 0
          ? `/api/donors?tagIds=${[...tagIds].join(",")}`
          : "/api/donors"
      const res = await fetch(url)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
        throw new Error(msg || `Failed to load donors (HTTP ${res.status}).`)
      }
      setDonors(Array.isArray(data) ? (data as Donor[]) : [])
      setPageIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load donors.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadDonors(selectedTagIds)
  }, [selectedTagIds])

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
      list = list.filter((d) => (d.display_name ?? "").toLowerCase().includes(q))
    }
    return list
  }, [donors, sortBy, searchQuery])

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

  const openDonorSheet = React.useCallback((donorId: string) => {
    setSheetDonorId(donorId)
    setSheetOpen(true)
  }, [])

  const closeSheet = React.useCallback(() => {
    setSheetOpen(false)
    setSheetDonorId(null)
  }, [])
  const totalPages = Math.ceil(sortedDonors.length / pageSize)
  const paginatedDonors = sortedDonors.slice(
    pageIndex * pageSize,
    (pageIndex + 1) * pageSize
  )

  const canPreviousPage = pageIndex > 0
  const canNextPage = pageIndex < totalPages - 1

  return (
    <div className="flex flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <IconUsers className="size-5 text-slate-900 dark:text-white" />
        <h1 className="text-xl font-semibold">Donor CRM</h1>
      </div>

      <Card className="mx-4 lg:mx-6 bg-gradient-to-t from-primary/5 to-card shadow-xs">
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
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPageIndex(0)
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <DonorBadges
              visibleBadges={visibleBadges}
              onVisibleBadgesChange={setVisibleBadges}
              badgeConfig={badgeConfig}
              onBadgeConfigChange={setBadgeConfig}
              open={badgesPopoverOpen}
              onOpenChange={setBadgesPopoverOpen}
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
              visibleBadges={visibleBadges}
              badgeConfig={badgeConfig}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="donor-sort" className="text-sm font-medium whitespace-nowrap">
                Sort by
              </Label>
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  setSortBy(value as SortOption)
                  setPageIndex(0)
                }}
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
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-right">Last Gift Amount</TableHead>
                  <TableHead className="font-semibold text-right">Last Gift Date</TableHead>
                  <TableHead className="font-semibold text-right">Lifetime Amount</TableHead>
                  <TableHead className="font-semibold">Address</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      Loading donors…
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : paginatedDonors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      {searchQuery.trim()
                        ? "No donors match your search."
                        : selectedTagIds.size > 0
                          ? "No donors have the selected tags."
                          : "No donors found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDonors.map((donor) => (
                    <TableRow
                      key={donor.id}
                      className={
                        donor.id === sheetDonorId
                          ? "bg-primary/10 hover:bg-primary/10 cursor-pointer"
                          : "cursor-pointer"
                      }
                      onClick={() => openDonorSheet(donor.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          openDonorSheet(donor.id)
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        {donor.display_name ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <LifecycleBadges
                            {...getDonorLifecycleStatus(
                              {
                                last_donation_date: donor.last_donation_date,
                                first_donation_date: donor.first_donation_date,
                                total_lifetime_value: donor.total_lifetime_value,
                              },
                              badgeConfig
                            )}
                            visibleBadges={visibleBadges}
                          />
                          {(donor.tags ?? []).map((t) => (
                            <Badge
                              key={t.id}
                              variant="secondary"
                              className="text-xs font-normal border-0"
                              style={{
                                backgroundColor:
                                  t.color === "red"
                                    ? "rgb(254 226 226)"
                                    : t.color === "blue"
                                      ? "rgb(219 234 254)"
                                      : t.color === "green"
                                        ? "rgb(220 252 231)"
                                        : t.color === "orange"
                                          ? "rgb(255 237 213)"
                                          : "rgb(243 244 246)",
                                color:
                                  t.color === "red"
                                    ? "rgb(153 27 27)"
                                    : t.color === "blue"
                                      ? "rgb(29 78 216)"
                                      : t.color === "green"
                                        ? "rgb(20 83 45)"
                                        : t.color === "orange"
                                          ? "rgb(154 52 18)"
                                          : "rgb(55 65 81)",
                              }}
                            >
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(donor.last_donation_amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDate(donor.last_donation_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(donor.total_lifetime_value)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-64 truncate">
                        {donor.billing_address ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-56 truncate text-sm">
                        {donor.notes?.trim() ?? "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                              size="icon"
                            >
                              <IconDotsVertical className="size-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => openDonorSheet(donor.id)}>
                              View profile
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/donors/${donor.id}`}>Open in full page</Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              {sortedDonors.length} donor(s) total
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden items-center gap-2 lg:flex">
                <Label htmlFor="rows-per-page" className="text-sm font-medium">
                  Rows per page
                </Label>
                <Select
                  value={`${pageSize}`}
                  onValueChange={(value) => {
                    setPageSize(Number(value))
                    setPageIndex(0)
                  }}
                >
                  <SelectTrigger className="w-20" size="sm" id="rows-per-page">
                    <SelectValue placeholder={pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((size) => (
                      <SelectItem key={size} value={`${size}`}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-center text-sm font-medium">
                Page {pageIndex + 1} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex bg-transparent"
                  onClick={() => setPageIndex(0)}
                  disabled={!canPreviousPage}
                >
                  <span className="sr-only">Go to first page</span>
                  <IconChevronsLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="size-8 bg-transparent"
                  size="icon"
                  onClick={() => setPageIndex(pageIndex - 1)}
                  disabled={!canPreviousPage}
                >
                  <span className="sr-only">Go to previous page</span>
                  <IconChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="size-8 bg-transparent"
                  size="icon"
                  onClick={() => setPageIndex(pageIndex + 1)}
                  disabled={!canNextPage}
                >
                  <span className="sr-only">Go to next page</span>
                  <IconChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  className="hidden size-8 lg:flex bg-transparent"
                  size="icon"
                  onClick={() => setPageIndex(totalPages - 1)}
                  disabled={!canNextPage}
                >
                  <span className="sr-only">Go to last page</span>
                  <IconChevronsRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg"
        >
          {/* Header: subtle bg, name + lifecycle badges, letter button top-right */}
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3 pr-12">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SheetTitle className="text-2xl font-bold tracking-tight truncate">
                  {sheetProfile?.donor?.display_name ?? "Donor"}
                </SheetTitle>
                {!sheetLoading && sheetProfile?.donor && sheetDonorId && (
                  <LifecycleBadges
                    {...getDonorLifecycleStatus(
                      {
                        last_donation_date: sheetProfile.donor.last_donation_date,
                        first_donation_date:
                          sheetProfile.donations.length > 0
                            ? sheetProfile.donations.reduce(
                                (min, d) => (d.date && (!min || d.date < min) ? d.date : min),
                                ""
                              )
                            : null,
                        total_lifetime_value: sheetProfile.donor.total_lifetime_value,
                      },
                      badgeConfig
                    )}
                    visibleBadges={visibleBadges}
                    className="shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 space-y-4 py-4 pb-6">
            {sheetLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!sheetLoading && sheetProfile?.donor && sheetDonorId && (
              <>
                {/* Stats: single row, 3 columns, centered */}
                <div className="grid grid-cols-3 divide-x border-b pb-4">
                  <div className="flex flex-col items-center justify-center px-2 first:pl-0 last:pr-0">
                    <span className="text-xs text-muted-foreground">Lifetime Value</span>
                    <span className="text-lg font-semibold tabular-nums mt-0.5">
                      {formatCurrency(sheetProfile.donor.total_lifetime_value)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-2 first:pl-0 last:pr-0">
                    <span className="text-xs text-muted-foreground">Last Gift</span>
                    <span className="text-lg font-semibold mt-0.5">
                      {formatDate(sheetProfile.donor.last_donation_date)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-2 first:pl-0 last:pr-0">
                    <span className="text-xs text-muted-foreground">Avg Gift</span>
                    <span className="text-lg font-semibold tabular-nums mt-0.5">
                      {formatCurrency(
                        sheetProfile.donations.length > 0 && sheetProfile.donor.total_lifetime_value != null
                          ? (typeof sheetProfile.donor.total_lifetime_value === "number"
                              ? sheetProfile.donor.total_lifetime_value
                              : Number(sheetProfile.donor.total_lifetime_value)) / sheetProfile.donations.length
                          : 0
                      )}
                    </span>
                  </div>
                </div>
                {/* Contact: clean list with icons */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Mail className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{sheetProfile.donor.email ?? "—"}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Phone className="size-4 shrink-0 text-muted-foreground" />
                      <span>{sheetProfile.donor.phone ?? "—"}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <MapPin className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">{sheetProfile.donor.billing_address ?? "—"}</span>
                    </li>
                  </ul>
                </div>
                <DonorTagsCard donorId={sheetDonorId} />
                <DonorNotesCard
                  donorId={sheetDonorId}
                  initialNotes={sheetProfile.donor.notes}
                  textareaClassName="bg-muted/50"
                  onNotesSaved={(id, notes) => {
                    setDonors((prev) =>
                      prev.map((d) => (d.id === id ? { ...d, notes } : d))
                    )
                    setSheetProfile((p) =>
                      p ? { ...p, donor: { ...p.donor, notes } } : p
                    )
                  }}
                />
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
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base">History</CardTitle>
                      <CardDescription>Giving and communications</CardDescription>
                    </div>
                    <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm">Log Activity</Button>
                      </DialogTrigger>
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
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="giving" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="giving">Giving History</TabsTrigger>
                        <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      </TabsList>
                      <TabsContent value="giving" className="mt-3">
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
                                  <TableCell className="text-muted-foreground max-w-[180px] truncate text-sm">{d.memo ?? "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TabsContent>
                      <TabsContent value="timeline" className="mt-3">
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
                  </CardContent>
                </Card>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/donors/${sheetDonorId}`} onClick={closeSheet}>
                    Open full profile page
                  </Link>
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
