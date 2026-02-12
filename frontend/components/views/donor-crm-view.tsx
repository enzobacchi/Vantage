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
import { FileText, Mail, MapPin, Phone } from "lucide-react"

import { getDonorProfile, getDonorActivityNotes, type DonorProfileDonor, type DonorProfileDonation, type DonorNoteRow } from "@/app/donors/[id]/actions"
import { DonorNotesCard } from "@/components/donors/donor-notes-card"
import { LetterDialog } from "@/components/donors/letter-dialog"
import { MagicActionsCard } from "@/components/donors/magic-actions-card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Donor = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
  last_donation_amount: number | string | null
  last_donation_date: string | null
  billing_address: string | null
  state: string | null
  notes: string | null
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

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 60 * 60 * 1000
function isActiveProfile(lastDonationDate: string | null): boolean {
  if (!lastDonationDate) return false
  const t = new Date(lastDonationDate).getTime()
  return Date.now() - t <= EIGHTEEN_MONTHS_MS
}

export function DonorCRMView() {
  const [donors, setDonors] = React.useState<Donor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  const [sortBy, setSortBy] = React.useState<SortOption>("recent")
  const [searchQuery, setSearchQuery] = React.useState("")

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetDonorId, setSheetDonorId] = React.useState<string | null>(null)
  const [sheetProfile, setSheetProfile] = React.useState<{ donor: DonorProfileDonor; donations: DonorProfileDonation[] } | null>(null)
  const [sheetActivity, setSheetActivity] = React.useState<DonorNoteRow[]>([])
  const [sheetLoading, setSheetLoading] = React.useState(false)

  const loadDonors = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/donors")
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
    loadDonors()
  }, [loadDonors])

  const sortedDonors = React.useMemo(() => {
    const sorted = sortDonors(donors, sortBy)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((d) => (d.display_name ?? "").toLowerCase().includes(q))
  }, [donors, sortBy, searchQuery])

  React.useEffect(() => {
    if (!sheetOpen || !sheetDonorId) {
      setSheetProfile(null)
      setSheetActivity([])
      return
    }
    let cancelled = false
    setSheetLoading(true)
    Promise.all([
      getDonorProfile(sheetDonorId),
      getDonorActivityNotes(sheetDonorId),
    ])
      .then(([profile, activity]) => {
        if (cancelled) return
        if (profile.donor) {
          setSheetProfile({ donor: profile.donor, donations: profile.donations })
          setSheetActivity(activity)
        } else {
          setSheetProfile(null)
          setSheetActivity([])
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
    <div className="flex flex-1 flex-col gap-4 py-4 md:py-6">
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
                  <SelectItem value="recent">Most recent first</SelectItem>
                  <SelectItem value="highest">Highest gift amount</SelectItem>
                  <SelectItem value="lowest">Lowest gift amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Name</TableHead>
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
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      Loading donors…
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : paginatedDonors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      {searchQuery.trim()
                        ? "No donors match your search."
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
          {/* Header: subtle bg, name + badge, letter button top-right */}
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3 pr-12">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SheetTitle className="text-2xl font-bold tracking-tight truncate">
                  {sheetProfile?.donor?.display_name ?? "Donor"}
                </SheetTitle>
                {!sheetLoading && sheetProfile?.donor && sheetDonorId && (
                  <Badge
                    variant={isActiveProfile(sheetProfile.donor.last_donation_date) ? "default" : "secondary"}
                    className="shrink-0 text-xs font-medium"
                  >
                    {isActiveProfile(sheetProfile.donor.last_donation_date) ? "Active" : "Lapsed"}
                  </Badge>
                )}
              </div>
              {!sheetLoading && sheetDonorId && (
                <LetterDialog
                  donorId={sheetDonorId}
                  defaultYear={new Date().getFullYear() - 1}
                  trigger={
                    <Button variant="outline" size="sm" className="shrink-0 h-8 gap-1.5">
                      <FileText className="size-3.5" />
                      <span className="hidden sm:inline">Letter</span>
                    </Button>
                  }
                />
              )}
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
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Donation History</CardTitle>
                    <CardDescription>
                      {sheetProfile.donations.length} donation{sheetProfile.donations.length === 1 ? "" : "s"} on file
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
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
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Activity Log</CardTitle>
                    <CardDescription>Call notes and touchpoints</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sheetActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No activity logged yet. Use &quot;Log Call&quot; in Magic Actions to record a note.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sheetActivity.map((entry) => (
                          <li key={entry.id} className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                            <p className="whitespace-pre-wrap">{entry.note}</p>
                          </li>
                        ))}
                      </ul>
                    )}
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
