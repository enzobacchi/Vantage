"use client"

import * as React from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"
import { Download, ExternalLink, GitMerge, Mail, MapPin, Phone, Search, Trash2, UserCircle2, Users } from "lucide-react"

import { getDonorProfile, type DonorProfileDonor, type DonorProfileDonation } from "@/app/donors/[id]/actions"
import { listReceiptTemplates, type ReceiptTemplate } from "@/app/actions/receipt-templates"
import { applyEmailTemplate } from "@/app/settings/settings-email-templates"
import { getDonorInteractions, logInteraction } from "@/app/actions/crm"
import { DEFAULT_LIFECYCLE_CONFIG } from "@/lib/donor-lifecycle"
import type { Interaction } from "@/types/database"
import { bulkAssignTag, bulkRemoveTag, getOrganizationTags } from "@/app/actions/tags"
import { bulkAssignDonors, bulkDeleteDonors, mergeDonors } from "@/app/actions/donors"
import { getOrgAssignees, getCurrentMemberInfo, type OrgAssignee } from "@/app/actions/team"
import { DonorTagFilter, type TagForFilter } from "@/components/donors/donor-filters"
import {
  DonorAssigneeFilter,
  UNASSIGNED_VALUE,
} from "@/components/donors/donor-assignee-filter"
import { DateRangeFilter, getDateRangeFromSearchParams } from "@/components/date-range-filter"
import { format } from "date-fns"
import { SaveReportButton } from "@/components/donors/save-report-button"
import { useNav } from "@/components/nav-context"
import { ScoreBadge } from "@/components/donors/donor-health-score"
import { getDonorPledges } from "@/app/actions/pledges"
import type { Pledge } from "@/app/actions/pledges"
import { formatFrequency } from "@/lib/pledge-helpers"
import { getPledgeProgress } from "@/lib/pledge-helpers"
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
import { Skeleton } from "@/components/ui/skeleton"
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
import { DataTable, type DataTableRef } from "@/components/ui/data-table"
import { createDonorColumns, type Donor } from "@/components/views/donor-crm/columns"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmailComposeDialog, type EmailRecipient } from "@/components/email/email-compose-dialog"

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

type SortOption = "recent" | "highest" | "lowest" | "lifetime_highest" | "lifetime_lowest"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "highest", label: "Highest last gift" },
  { value: "lowest", label: "Lowest last gift" },
  { value: "lifetime_highest", label: "Highest lifetime" },
  { value: "lifetime_lowest", label: "Lowest lifetime" },
]

function LogActivityDialog({
  donorId,
  donorEmail,
  donorName,
  defaultTab = "call",
  onLogged,
  onClose,
}: {
  donorId: string
  donorEmail: string | null
  donorName?: string | null
  defaultTab?: "call" | "email" | "task"
  onLogged: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = React.useState<"call" | "email" | "task">(defaultTab)
  const [subject, setSubject] = React.useState("")
  const [content, setContent] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [templates, setTemplates] = React.useState<ReceiptTemplate[]>([])

  React.useEffect(() => {
    setActiveTab(defaultTab)
  }, [defaultTab])

  React.useEffect(() => {
    if (activeTab === "email") {
      listReceiptTemplates().then(setTemplates).catch(() => {})
    }
  }, [activeTab])

  function applyTemplate(template: ReceiptTemplate) {
    const { subject: s, body: b } = applyEmailTemplate(template, {
      donor_name: donorName ?? undefined,
      date: new Date().toLocaleDateString(),
    })
    setSubject(s)
    setContent(b)
  }

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
            {templates.length > 0 && (
              <div>
                <Label>Use a template</Label>
                <Select
                  onValueChange={(id) => {
                    const tpl = templates.find((t) => t.id === id)
                    if (tpl) applyTemplate(tpl)
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

const PAGE_SIZE = 50

export function DonorCRMView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { selectedDonorId, clearSelectedDonor } = useNav()
  const [donors, setDonors] = React.useState<Donor[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<SortOption>("recent")
  const [selectedDonors, setSelectedDonors] = React.useState<Donor[]>([])
  const [bulkTagOpen, setBulkTagOpen] = React.useState<"add" | "remove" | null>(null)
  const [bulkTagSaving, setBulkTagSaving] = React.useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkDeleting, setBulkDeleting] = React.useState(false)
  const [mergeOpen, setMergeOpen] = React.useState(false)
  const [merging, setMerging] = React.useState(false)
  const [mergePrimaryId, setMergePrimaryId] = React.useState<string | null>(null)
  const dataTableRef = React.useRef<DataTableRef<Donor> | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  const [orgTags, setOrgTags] = React.useState<TagForFilter[]>([])
  const [selectedTagIds, setSelectedTagIds] = React.useState<Set<string>>(new Set())
  const [tagFilterPopoverOpen, setTagFilterPopoverOpen] = React.useState(false)

  const [orgAssignees, setOrgAssignees] = React.useState<OrgAssignee[]>([])
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [selectedAssigneeIds, setSelectedAssigneeIds] = React.useState<Set<string>>(new Set())
  const [savedAssigneeIds, setSavedAssigneeIds] = React.useState<Set<string>>(new Set())
  const [myDonorsActive, setMyDonorsActive] = React.useState(false)
  const [assigneeFilterPopoverOpen, setAssigneeFilterPopoverOpen] = React.useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = React.useState(false)
  const [bulkAssignSaving, setBulkAssignSaving] = React.useState(false)
  const [bulkAssignConfirm, setBulkAssignConfirm] = React.useState<{
    userId: string | null
    label: string
  } | null>(null)

  React.useEffect(() => {
    getOrganizationTags().then(setOrgTags).catch(() => {})
    getOrgAssignees().then(setOrgAssignees).catch(() => {})
    getCurrentMemberInfo().then((info) => setCurrentUserId(info?.userId ?? null)).catch(() => {})
  }, [])

  const assigneeMap = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const a of orgAssignees) m.set(a.user_id, a.name)
    return m
  }, [orgAssignees])

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
  const [sheetInteractions, setSheetInteractions] = React.useState<Interaction[]>([])
  const [sheetLoading, setSheetLoading] = React.useState(false)
  const [sheetScore, setSheetScore] = React.useState<{ score: number; label: string } | null>(null)
  const [sheetActivePledges, setSheetActivePledges] = React.useState<Pledge[]>([])
  const [logActivityOpen, setLogActivityOpen] = React.useState(false)
  const [logActivityDefaultTab, setLogActivityDefaultTab] = React.useState<"call" | "email" | "task">("call")
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false)
  const [emailTarget, setEmailTarget] = React.useState<Donor | null>(null)

  const loadDonors = React.useCallback(async (
    tagIds?: Set<string>,
    dateRange?: { from?: string; to?: string },
    currentPage?: number,
    search?: string,
    sort?: SortOption,
    assigneeIds?: Set<string>,
  ) => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (tagIds && tagIds.size > 0) params.set("tagIds", [...tagIds].join(","))
      if (dateRange?.from) params.set("from", dateRange.from)
      if (dateRange?.to) params.set("to", dateRange.to)
      if (search?.trim()) params.set("search", search.trim())
      if (sort) params.set("sort", sort)
      if (assigneeIds && assigneeIds.size > 0) {
        params.set("assignedTo", [...assigneeIds].join(","))
      }
      params.set("page", String(currentPage ?? 0))
      params.set("limit", String(PAGE_SIZE))
      const res = await fetch(`/api/donors?${params.toString()}`)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
        throw new Error(msg || `Failed to load donors (HTTP ${res.status}).`)
      }
      if (typeof data === "object" && data && "donors" in data) {
        const r = data as { donors: Donor[]; total: number }
        setDonors(r.donors)
        setTotal(r.total)
      } else {
        setDonors([])
        setTotal(0)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load donors.")
    } finally {
      setLoading(false)
    }
  }, [])

  const dateRange = React.useMemo(() => getDateRangeFromSearchParams(searchParams), [searchParams])

  React.useEffect(() => {
    loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy, selectedAssigneeIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTagIds, dateRange.from, dateRange.to, page, sortBy, selectedAssigneeIds, loadDonors])

  // When search query changes, reset to page 0 and reload
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPage(0)
      loadDonors(selectedTagIds, dateRange, 0, searchQuery, sortBy, selectedAssigneeIds)
    }, 300)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  const handleTagFilterChange = React.useCallback(
    (next: Set<string>) => {
      setPage(0)
      setSelectedTagIds(next)
    },
    []
  )

  const handleAssigneeFilterChange = React.useCallback(
    (next: Set<string>) => {
      setPage(0)
      setSelectedAssigneeIds(next)
      setSavedAssigneeIds(next)
    },
    []
  )

  const toggleMyDonors = React.useCallback(() => {
    if (!currentUserId) {
      toast.error("Could not determine your account")
      return
    }
    setPage(0)
    if (myDonorsActive) {
      setMyDonorsActive(false)
      setSelectedAssigneeIds(new Set(savedAssigneeIds))
    } else {
      setSavedAssigneeIds(selectedAssigneeIds)
      setMyDonorsActive(true)
      setSelectedAssigneeIds(new Set([currentUserId]))
    }
  }, [currentUserId, myDonorsActive, savedAssigneeIds, selectedAssigneeIds])

  const runBulkAssign = React.useCallback(
    async (assignedTo: string | null) => {
      if (selectedDonors.length === 0) return
      setBulkAssignSaving(true)
      try {
        const count = await bulkAssignDonors(
          selectedDonors.map((d) => d.id),
          assignedTo
        )
        const assigneeName = assignedTo
          ? orgAssignees.find((a) => a.user_id === assignedTo)?.name ?? "user"
          : null
        toast.success(
          assigneeName
            ? `Assigned ${count} donor${count === 1 ? "" : "s"} to ${assigneeName}`
            : `Unassigned ${count} donor${count === 1 ? "" : "s"}`
        )
        setBulkAssignOpen(false)
        setBulkAssignConfirm(null)
        dataTableRef.current?.clearSelection()
        loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy, selectedAssigneeIds)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to assign donors")
      } finally {
        setBulkAssignSaving(false)
      }
    },
    [
      selectedDonors,
      orgAssignees,
      selectedTagIds,
      dateRange,
      page,
      searchQuery,
      sortBy,
      selectedAssigneeIds,
      loadDonors,
    ]
  )

  const handleBulkAssign = React.useCallback(
    (assignedTo: string | null, label: string) => {
      if (selectedDonors.length >= 50) {
        setBulkAssignConfirm({ userId: assignedTo, label })
        setBulkAssignOpen(false)
        return
      }
      void runBulkAssign(assignedTo)
    },
    [selectedDonors.length, runBulkAssign]
  )

  // Sorting is now handled server-side via the sort query param

  const openDonorSheet = React.useCallback((donorId: string) => {
    setSheetDonorId(donorId)
    setSheetOpen(true)
  }, [])

  const handleSendEmailFromRow = React.useCallback((donor: Donor) => {
    setEmailTarget(donor)
    setEmailDialogOpen(true)
  }, [])

  const donorColumns = React.useMemo(
    () =>
      createDonorColumns({
        onOpenDonorSheet: openDonorSheet,
        onSendEmail: handleSendEmailFromRow,
        assigneeMap,
      }),
    [openDonorSheet, handleSendEmailFromRow, assigneeMap]
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
        loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add tag")
      } finally {
        setBulkTagSaving(false)
      }
    },
    [selectedDonors, selectedTagIds, dateRange, page, searchQuery, sortBy, loadDonors]
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
        loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove tag")
      } finally {
        setBulkTagSaving(false)
      }
    },
    [selectedDonors, selectedTagIds, dateRange, page, searchQuery, sortBy, loadDonors]
  )

  const handleBulkDelete = React.useCallback(async () => {
    if (selectedDonors.length === 0) return
    setBulkDeleting(true)
    try {
      const count = await bulkDeleteDonors(selectedDonors.map((d) => d.id))
      toast.success(`Deleted ${count} donor${count === 1 ? "" : "s"}`)
      setBulkDeleteOpen(false)
      dataTableRef.current?.clearSelection()
      loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete donors")
    } finally {
      setBulkDeleting(false)
    }
  }, [selectedDonors, selectedTagIds, dateRange, page, searchQuery, sortBy, loadDonors])

  const handleBulkExport = React.useCallback(() => {
    if (selectedDonors.length === 0) return
    const headers = ["Name", "State", "Total Giving", "Last Gift Date", "Last Gift Amount"]
    const rows = selectedDonors.map((d) => [
      d.display_name ?? "",
      d.state ?? "",
      String(d.total_lifetime_value ?? ""),
      d.last_donation_date ?? "",
      String(d.last_donation_amount ?? ""),
    ])
    const escape = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }
    const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `vantage-donors-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${selectedDonors.length} donor${selectedDonors.length === 1 ? "" : "s"}`)
  }, [selectedDonors])

  const handleMerge = React.useCallback(async () => {
    if (selectedDonors.length !== 2 || !mergePrimaryId) return
    setMerging(true)
    const secondaryId = selectedDonors.find((d) => d.id !== mergePrimaryId)?.id
    if (!secondaryId) return
    try {
      const result = await mergeDonors(mergePrimaryId, secondaryId)
      const primary = selectedDonors.find((d) => d.id === mergePrimaryId)
      toast.success(
        `Merged successfully. Moved ${result.donations_moved} donation${result.donations_moved === 1 ? "" : "s"} to ${primary?.display_name ?? "donor"}.`
      )
      setMergeOpen(false)
      setMergePrimaryId(null)
      dataTableRef.current?.clearSelection()
      loadDonors(selectedTagIds, dateRange, page, searchQuery, sortBy)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to merge donors")
    } finally {
      setMerging(false)
    }
  }, [selectedDonors, mergePrimaryId, selectedTagIds, dateRange, page, searchQuery, sortBy, loadDonors])

  React.useEffect(() => {
    if (!sheetOpen || !sheetDonorId) {
      setSheetProfile(null)
      setSheetInteractions([])
      setSheetScore(null)
      setSheetActivePledges([])
      return
    }
    let cancelled = false
    setSheetLoading(true)
    Promise.all([
      getDonorProfile(sheetDonorId),
      getDonorInteractions(sheetDonorId),
      getDonorPledges(sheetDonorId),
      fetch(`/api/donors/${sheetDonorId}/score`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([profile, interactions, pledges, scoreData]) => {
        if (cancelled) return
        if (profile.donor) {
          setSheetProfile({ donor: profile.donor, donations: profile.donations })
          setSheetInteractions(interactions)
        } else {
          setSheetProfile(null)
          setSheetInteractions([])
        }
        setSheetActivePledges((pledges as Pledge[]).filter(p => p.status === "active"))
        if (scoreData) setSheetScore({ score: scoreData.score, label: scoreData.label })
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
    setSheetScore(null)
    setSheetActivePledges([])
  }, [])
  const emptyMessage = searchQuery.trim()
    ? "No donors match your search."
    : selectedTagIds.size > 0
      ? "No donors have the selected tags."
      : "No donors found."

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1
  const showingTo = Math.min(page * PAGE_SIZE + donors.length, total)

  return (
    <div className="flex flex-col gap-4 py-4 md:py-6">
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Users className="size-5 text-slate-900 dark:text-white" />
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
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
                setPage(0)
                loadDonors(selectedTagIds, next, 0, searchQuery, sortBy)
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
            <DonorAssigneeFilter
              assignees={orgAssignees.filter((a) => a.user_id !== currentUserId)}
              selectedAssigneeIds={selectedAssigneeIds}
              onSelectedAssigneeIdsChange={handleAssigneeFilterChange}
              disabled={myDonorsActive}
              open={assigneeFilterPopoverOpen}
              onOpenChange={setAssigneeFilterPopoverOpen}
            />
            {currentUserId && (
              <Button
                variant={myDonorsActive ? "default" : "outline"}
                size="sm"
                className="gap-2 h-9"
                onClick={toggleMyDonors}
              >
                <UserCircle2 className="size-4 shrink-0" />
                My Donors
              </Button>
            )}
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
                onValueChange={(value) => { setSortBy(value as SortOption); setPage(0) }}
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
              <Popover open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={bulkAssignSaving}
                  >
                    <UserCircle2 className="size-3.5" strokeWidth={1.5} />
                    Assign to…
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start italic text-muted-foreground"
                      onClick={() => handleBulkAssign(null, "Unassigned")}
                      disabled={bulkAssignSaving}
                    >
                      Unassigned
                    </Button>
                    {orgAssignees.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-1.5">
                        No team members available. Invite teammates from Settings → Team.
                      </p>
                    ) : (
                      orgAssignees.map((a) => (
                        <Button
                          key={a.user_id}
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => handleBulkAssign(a.user_id, a.name)}
                          disabled={bulkAssignSaving}
                        >
                          {a.name}
                        </Button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkExport}
                className="gap-1.5"
              >
                <Download className="size-3.5" strokeWidth={1.5} />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmailTarget(null)
                  setEmailDialogOpen(true)
                }}
                className="gap-1.5"
              >
                <Mail className="size-3.5" strokeWidth={1.5} />
                Send Email ({selectedDonors.length})
              </Button>
              {selectedDonors.length === 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMergePrimaryId(selectedDonors[0].id)
                    setMergeOpen(true)
                  }}
                  className="gap-1.5"
                >
                  <GitMerge className="size-3.5" strokeWidth={1.5} />
                  Merge
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dataTableRef.current?.clearSelection()}
              >
                Clear selection
              </Button>
            </div>
          )}

          {/* Bulk Assign Confirmation (only when ≥50 donors) */}
          <AlertDialog
            open={bulkAssignConfirm !== null}
            onOpenChange={(open) => {
              if (!open) setBulkAssignConfirm(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Assign {selectedDonors.length} donors to {bulkAssignConfirm?.label}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You&apos;re about to reassign {selectedDonors.length} donor records.
                  This change will apply immediately and can be undone by reassigning them again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkAssignSaving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkAssignConfirm && runBulkAssign(bulkAssignConfirm.userId)}
                  disabled={bulkAssignSaving}
                >
                  {bulkAssignSaving ? "Assigning…" : `Assign ${selectedDonors.length} donors`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bulk Delete Confirmation */}
          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedDonors.length} donor{selectedDonors.length === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the selected donor{selectedDonors.length === 1 ? "" : "s"} and all their donations, interactions, notes, and tags. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {bulkDeleting ? "Deleting..." : `Delete ${selectedDonors.length} donor${selectedDonors.length === 1 ? "" : "s"}`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Merge Dialog */}
          <Dialog open={mergeOpen} onOpenChange={(open) => { if (!open) { setMergeOpen(false); setMergePrimaryId(null) } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Merge Donors</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Select the primary donor to keep. All donations, interactions, notes, and tags from the other donor will be moved to the primary donor, and the secondary donor will be deleted.
              </p>
              <div className="space-y-2 pt-2">
                {selectedDonors.length === 2 && selectedDonors.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setMergePrimaryId(d.id)}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      mergePrimaryId === d.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{d.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.state ?? "No state"} | Total: {d.total_lifetime_value ?? "$0"}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        mergePrimaryId === d.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {mergePrimaryId === d.id ? "Keep" : "Merge into other"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setMergeOpen(false); setMergePrimaryId(null) }}
                  disabled={merging}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMerge}
                  disabled={merging || !mergePrimaryId}
                >
                  {merging ? "Merging..." : "Merge Donors"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DataTable<Donor, unknown>
            columns={donorColumns}
            data={donors}
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

          {/* Pagination */}
          {!loading && !error && total > 0 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {showingFrom}–{showingTo} of {total} donor{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-1">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent
          side="right"
          className="flex flex-col w-full sm:max-w-xl p-0 gap-0 overflow-hidden"
        >
          {/* Header */}
          <SheetHeader className="shrink-0 border-b bg-muted/30 px-6 py-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <SheetTitle className="text-xl font-bold tracking-tight truncate">
                  {sheetProfile?.donor?.display_name ?? "Donor"}
                </SheetTitle>
                {sheetScore && (
                  <ScoreBadge score={sheetScore.score} label={sheetScore.label as any} className="shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Send email"
                  onClick={() => {
                    setLogActivityDefaultTab("email")
                    setLogActivityOpen(true)
                  }}
                >
                  <Mail className="size-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Log call"
                  onClick={() => {
                    setLogActivityDefaultTab("call")
                    setLogActivityOpen(true)
                  }}
                >
                  <Phone className="size-3.5" strokeWidth={1.5} />
                </Button>
                {sheetDonorId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => {
                      closeSheet()
                      router.push(`/dashboard/donors/${sheetDonorId}`)
                    }}
                  >
                    <ExternalLink className="size-3 mr-1.5" />
                    Full Profile
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Scrollable body */}
          {sheetLoading && (
            <div className="flex flex-1 p-6 space-y-4">
              <div className="space-y-4 w-full">
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 rounded-lg border p-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-4 rounded" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              </div>
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

                  {/* Stats + contact + AI insights + notes — streamlined single column */}
                  <div className="space-y-4">
                    {/* Giving stats */}
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

                    {/* Active pledge summary (if any) */}
                    {sheetActivePledges.length > 0 && (
                      <div className="text-xs text-muted-foreground px-1">
                        {sheetActivePledges.length === 1 ? (
                          <>
                            1 active pledge · {formatCurrency(sheetActivePledges[0].amount)} {formatFrequency(sheetActivePledges[0].frequency)} · {getPledgeProgress(sheetActivePledges[0])}% fulfilled
                          </>
                        ) : (
                          <>{sheetActivePledges.length} active pledges</>
                        )}
                      </div>
                    )}

                    {/* Contact */}
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

                  </div>

                  {/* Log Activity dialog — state-controlled, no nested trigger */}
                  <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
                    <LogActivityDialog
                      donorId={sheetDonorId}
                      donorEmail={sheetProfile?.donor?.email ?? null}
                      donorName={sheetProfile?.donor?.display_name ?? null}
                      defaultTab={logActivityDefaultTab}
                      onLogged={() => {
                        getDonorInteractions(sheetDonorId).then(setSheetInteractions)
                        setLogActivityOpen(false)
                      }}
                      onClose={() => setLogActivityOpen(false)}
                    />
                  </Dialog>

                  {/* Recent Gifts — compact summary */}
                  {donations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground px-1">Recent Gifts</p>
                      <div className="space-y-1.5">
                        {donations.slice(0, 3).map((d) => (
                          <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                            <span className="text-sm text-muted-foreground">{formatDate(d.date)}</span>
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                      {donations.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{donations.length - 3} more gift{donations.length - 3 !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {/* View Full Profile CTA */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      closeSheet()
                      router.push(`/dashboard/donors/${sheetDonorId}`)
                    }}
                  >
                    <ExternalLink className="size-3.5 mr-2" strokeWidth={1.5} />
                    View Full Profile
                  </Button>
                </div>
              )
            })()
          )}
        </SheetContent>
      </Sheet>

      {/* Email Compose Dialog */}
      {emailDialogOpen && emailTarget ? (
        <EmailComposeDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          mode="single"
          recipient={{
            donorId: emailTarget.id,
            donorEmail: emailTarget.email,
            donorName: emailTarget.display_name,
          }}
          onSent={() => {
            if (sheetDonorId) {
              getDonorInteractions(sheetDonorId).then(setSheetInteractions)
            }
          }}
        />
      ) : emailDialogOpen && selectedDonors.length > 0 ? (
        <EmailComposeDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          mode="bulk"
          recipients={selectedDonors.map((d) => ({
            donorId: d.id,
            donorEmail: d.email,
            donorName: d.display_name,
          }))}
          onSent={() => {
            dataTableRef.current?.clearSelection()
          }}
        />
      ) : null}
    </div>
  )
}
