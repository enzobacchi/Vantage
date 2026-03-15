"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Banknote, ChevronLeft, ChevronRight, DollarSign } from "lucide-react"
import { toast } from "sonner"

import { bulkUpdateDonations, getOrgDonationOptions, type OrgDonationOptionRow } from "@/app/actions/donations"
import type { PaymentMethod } from "@/types/database"
import { formatCurrency } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useNav } from "@/components/nav-context"
import { DateRangeFilter, getDateRangeFromSearchParams } from "@/components/date-range-filter"

type DonationListItem = {
  id: string
  donor_id: string
  donor_name: string | null
  amount: number
  date: string | null
  memo: string | null
  payment_method: string
  category_id: string | null
  campaign_id: string | null
  fund_id: string | null
  category_name: string | null
  campaign_name: string | null
  fund_name: string | null
  acknowledgment_sent_at: string | null
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "venmo", label: "Venmo" },
  { value: "daf", label: "DAF" },
  { value: "other", label: "Other" },
  { value: "quickbooks", label: "QuickBooks" },
]

function formatDate(value: string | null | undefined) {
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

function paymentMethodLabel(v: string): string {
  return PAYMENT_METHODS.find((p) => p.value === v)?.label ?? v
}

export function DonationsView() {
  const { openDonor } = useNav()
  const searchParams = useSearchParams()
  const dateRange = React.useMemo(() => getDateRangeFromSearchParams(searchParams), [searchParams])

  const [donations, setDonations] = React.useState<DonationListItem[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(25)
  const [paymentMethodFilter, setPaymentMethodFilter] = React.useState<string>("")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("")
  const [campaignFilter, setCampaignFilter] = React.useState<string>("")
  const [fundFilter, setFundFilter] = React.useState<string>("")
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = React.useState(false)
  const [bulkDialog, setBulkDialog] = React.useState<"payment" | "category" | "campaign" | "fund" | null>(null)

  const [categories, setCategories] = React.useState<OrgDonationOptionRow[]>([])
  const [campaigns, setCampaigns] = React.useState<OrgDonationOptionRow[]>([])
  const [funds, setFunds] = React.useState<OrgDonationOptionRow[]>([])

  React.useEffect(() => {
    getOrgDonationOptions()
      .then((opts) => {
        setCategories(opts.filter((o) => o.type === "category"))
        setCampaigns(opts.filter((o) => o.type === "campaign"))
        setFunds(opts.filter((o) => o.type === "fund"))
      })
      .catch(() => {})
  }, [])

  const loadDonations = React.useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", String(pageSize))
      if (paymentMethodFilter) params.set("payment_method", paymentMethodFilter)
      if (categoryFilter) params.set("category_id", categoryFilter)
      if (campaignFilter) params.set("campaign_id", campaignFilter)
      if (fundFilter) params.set("fund_id", fundFilter)
      if (dateRange.from) params.set("from", dateRange.from)
      if (dateRange.to) params.set("to", dateRange.to)
      const res = await fetch(`/api/donations?${params}`)
      const data = (await res.json()) as { donations?: DonationListItem[]; total?: number }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to load")
      setDonations(data.donations ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load donations")
      setDonations([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, paymentMethodFilter, categoryFilter, campaignFilter, fundFilter, dateRange.from, dateRange.to])

  React.useEffect(() => {
    setPage(0)
  }, [pageSize])

  React.useEffect(() => {
    loadDonations()
  }, [loadDonations])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === donations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(donations.map((d) => d.id)))
    }
  }

  const handleBulkUpdate = async (
    field: "payment_method" | "category_id" | "campaign_id" | "fund_id",
    value: string | null
  ) => {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const updates: Record<string, unknown> = {}
      if (field === "payment_method") updates.payment_method = value
      else if (field === "category_id") updates.category_id = value || null
      else if (field === "campaign_id") updates.campaign_id = value || null
      else if (field === "fund_id") updates.fund_id = value || null
      const count = await bulkUpdateDonations({
        donationIds: [...selectedIds],
        ...updates,
      })
      toast.success(`Updated ${count} donation${count === 1 ? "" : "s"}`)
      setSelectedIds(new Set())
      setBulkDialog(null)
      loadDonations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed")
    } finally {
      setBulkSaving(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const allSelected = donations.length > 0 && selectedIds.size === donations.length

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:py-6 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="size-5" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold">Donations</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard/donations/entry">
              <DollarSign className="size-4 mr-2" strokeWidth={1.5} />
              Log Donation
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter />
        <Select value={paymentMethodFilter || "__all__"} onValueChange={(v) => setPaymentMethodFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All methods</SelectItem>
            {PAYMENT_METHODS.map((pm) => (
              <SelectItem key={pm.value} value={pm.value}>
                {pm.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || "__all__"} onValueChange={(v) => setCategoryFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter || "__all__"} onValueChange={(v) => setCampaignFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fundFilter || "__all__"} onValueChange={(v) => setFundFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Fund" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All funds</SelectItem>
            {funds.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialog("payment")}
            disabled={bulkSaving}
          >
            Change Payment Method
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialog("category")}
            disabled={bulkSaving}
          >
            Change Category
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialog("campaign")}
            disabled={bulkSaving}
          >
            Change Campaign
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialog("fund")}
            disabled={bulkSaving}
          >
            Change Fund
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>

          {bulkDialog === "payment" && (
            <div className="flex items-center gap-2 ml-2">
              <Select
                onValueChange={(v) => {
                  handleBulkUpdate("payment_method", v)
                  setBulkDialog(null)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((p) => p.value !== "quickbooks").map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setBulkDialog(null)}>
                Cancel
              </Button>
            </div>
          )}
          {bulkDialog === "category" && (
            <div className="flex items-center gap-2 ml-2">
              <Select
                onValueChange={(v) => {
                  handleBulkUpdate("category_id", v === "__none__" ? null : v)
                  setBulkDialog(null)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setBulkDialog(null)}>
                Cancel
              </Button>
            </div>
          )}
          {bulkDialog === "campaign" && (
            <div className="flex items-center gap-2 ml-2">
              <Select
                onValueChange={(v) => {
                  handleBulkUpdate("campaign_id", v === "__none__" ? null : v)
                  setBulkDialog(null)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setBulkDialog(null)}>
                Cancel
              </Button>
            </div>
          )}
          {bulkDialog === "fund" && (
            <div className="flex items-center gap-2 ml-2">
              <Select
                onValueChange={(v) => {
                  handleBulkUpdate("fund_id", v === "__none__" ? null : v)
                  setBulkDialog(null)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setBulkDialog(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading donations…</p>
          </div>
        ) : donations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Banknote className="size-12 text-muted-foreground/50 mb-4" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No donations match your filters.</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/dashboard/donations/entry">Log a donation</Link>
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead className="max-w-[200px]">Memo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(d.id)}
                        onCheckedChange={() => toggleSelect(d.id)}
                        aria-label={`Select donation ${d.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{formatDate(d.date)}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-primary hover:underline text-left"
                        onClick={() => openDonor(d.donor_id)}
                      >
                        {d.donor_name ?? "—"}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(d.amount)}</TableCell>
                    <TableCell>{paymentMethodLabel(d.payment_method)}</TableCell>
                    <TableCell className="text-muted-foreground">{d.category_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{d.campaign_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{d.fund_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {d.memo && !/^qb_sales_receipt_id:/i.test(d.memo) ? d.memo : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2">
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Showing {total === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
                </p>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
