"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, DollarSign } from "lucide-react"
import { toast } from "sonner"

import { createDonor } from "@/app/actions/donors"
import {
  createDonation,
  createOrgDonationOption,
  getOrgDonationOptions,
  type OrgDonationOptionRow,
} from "@/app/actions/donations"
import type { PaymentMethod } from "@/types/database"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type DonorSearchItem = { id: string; display_name: string | null; total_lifetime_value: number | string | null }

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "venmo", label: "Venmo" },
  { value: "daf", label: "DAF" },
  { value: "other", label: "Other" },
]

const DONOR_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "corporate", label: "Corporate" },
  { value: "school", label: "School" },
  { value: "church", label: "Church" },
] as const

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DonationEntryPage() {
  const router = useRouter()
  const donorInputRef = React.useRef<HTMLInputElement>(null)
  const amountInputRef = React.useRef<HTMLInputElement>(null)

  const [donorMode, setDonorMode] = React.useState<"search" | "create">("search")
  const [donorPopoverOpen, setDonorPopoverOpen] = React.useState(false)
  const [donorId, setDonorId] = React.useState("")
  const [donorDisplayName, setDonorDisplayName] = React.useState("")
  const [donorSearchQuery, setDonorSearchQuery] = React.useState("")
  const [donorSearchResults, setDonorSearchResults] = React.useState<DonorSearchItem[]>([])
  const [donorSearching, setDonorSearching] = React.useState(false)
  const donorSearchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const [newDonorDisplayName, setNewDonorDisplayName] = React.useState("")
  const [newDonorFirstName, setNewDonorFirstName] = React.useState("")
  const [newDonorLastName, setNewDonorLastName] = React.useState("")
  const [newDonorEmail, setNewDonorEmail] = React.useState("")
  const [newDonorPhone, setNewDonorPhone] = React.useState("")
  const [newDonorAddress, setNewDonorAddress] = React.useState("")
  const [newDonorType, setNewDonorType] = React.useState<"individual" | "corporate" | "school" | "church">("individual")
  const isNewDonorIndividual = newDonorType === "individual"

  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState(todayISO())
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("check")
  const [categoryId, setCategoryId] = React.useState<string>("")
  const [campaignId, setCampaignId] = React.useState<string>("")
  const [fundId, setFundId] = React.useState<string>("")
  const [memo, setMemo] = React.useState("")

  const [categories, setCategories] = React.useState<OrgDonationOptionRow[]>([])
  const [campaigns, setCampaigns] = React.useState<OrgDonationOptionRow[]>([])
  const [funds, setFunds] = React.useState<OrgDonationOptionRow[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const [addOptionType, setAddOptionType] = React.useState<"category" | "campaign" | "fund" | null>(null)
  const [addOptionName, setAddOptionName] = React.useState("")
  const [addOptionSaving, setAddOptionSaving] = React.useState(false)

  const loadOptions = React.useCallback(() => {
    getOrgDonationOptions()
      .then((opts) => {
        setCategories(opts.filter((o) => o.type === "category"))
        setCampaigns(opts.filter((o) => o.type === "campaign"))
        setFunds(opts.filter((o) => o.type === "fund"))
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    loadOptions()
  }, [loadOptions])

  React.useEffect(() => {
    const q = donorSearchQuery.trim()
    if (!q) {
      setDonorSearchResults([])
      return
    }
    donorSearchDebounceRef.current = setTimeout(() => {
      setDonorSearching(true)
      fetch(`/api/donors/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((arr: DonorSearchItem[]) => setDonorSearchResults(Array.isArray(arr) ? arr : []))
        .catch(() => setDonorSearchResults([]))
        .finally(() => setDonorSearching(false))
    }, 200)
    return () => {
      if (donorSearchDebounceRef.current) clearTimeout(donorSearchDebounceRef.current)
    }
  }, [donorSearchQuery])

  const selectDonor = (d: DonorSearchItem) => {
    setDonorId(d.id)
    setDonorDisplayName(d.display_name?.trim() ?? "Unknown")
    setDonorPopoverOpen(false)
    setDonorSearchQuery("")
    setDonorSearchResults([])
    setTimeout(() => amountInputRef.current?.focus(), 0)
  }

  const clearDonor = () => {
    setDonorId("")
    setDonorDisplayName("")
    setDonorSearchQuery("")
    setDonorSearchResults([])
    donorInputRef.current?.focus()
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmedAmount = amount.trim()
    const numAmount = parseFloat(trimmedAmount)
    let resolvedDonorId = donorId

    if (donorMode === "search") {
      if (!donorId) {
        toast.error("Select a donor")
        donorInputRef.current?.focus()
        return
      }
    } else if (isNewDonorIndividual) {
      if (!newDonorFirstName.trim()) {
        toast.error("First name is required")
        return
      }
    } else {
      if (!newDonorDisplayName.trim()) {
        toast.error("Organization name is required")
        return
      }
    }

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Enter a valid amount")
      amountInputRef.current?.focus()
      return
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Enter a valid date")
      return
    }

    setSubmitting(true)
    try {
      if (donorMode === "create") {
        const first = newDonorFirstName.trim()
        const last = newDonorLastName.trim()
        const computedDisplayName = isNewDonorIndividual
          ? [first, last].filter(Boolean).join(" ")
          : newDonorDisplayName.trim()
        const { id } = await createDonor({
          display_name: computedDisplayName,
          first_name: isNewDonorIndividual ? first || null : null,
          last_name: isNewDonorIndividual ? last || null : null,
          email: newDonorEmail.trim() || null,
          phone: newDonorPhone.trim() || null,
          billing_address: newDonorAddress.trim() || null,
          donor_type: newDonorType,
        })
        resolvedDonorId = id
      }

      await createDonation({
        donor_id: resolvedDonorId,
        amount: numAmount,
        date,
        payment_method: paymentMethod,
        category_id: categoryId || null,
        campaign_id: campaignId || null,
        fund_id: fundId || null,
        memo: memo.trim() || null,
      })
      toast.success("Donation logged")
      setAmount("")
      setDate(todayISO())
      setPaymentMethod("check")
      setCategoryId("")
      setCampaignId("")
      setFundId("")
      setMemo("")
      if (donorMode === "create") {
        setNewDonorDisplayName("")
        setNewDonorFirstName("")
        setNewDonorLastName("")
        setNewDonorEmail("")
        setNewDonorPhone("")
        setNewDonorAddress("")
        setNewDonorType("individual")
      } else {
        clearDonor()
      }
      donorInputRef.current?.focus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddOption = async () => {
    if (!addOptionType) return
    const name = addOptionName.trim()
    if (!name) {
      toast.error("Name is required")
      return
    }
    setAddOptionSaving(true)
    try {
      const created = await createOrgDonationOption(addOptionType, name)
      loadOptions()
      if (addOptionType === "category") setCategoryId(created.id)
      else if (addOptionType === "campaign") setCampaignId(created.id)
      else setFundId(created.id)
      setAddOptionType(null)
      setAddOptionName("")
      toast.success("Added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add")
    } finally {
      setAddOptionSaving(false)
    }
  }

  const handleSubmitRef = React.useRef(handleSubmit)
  handleSubmitRef.current = handleSubmit
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handleSubmitRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:py-6 px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard?view=donations">
            <ArrowLeft className="size-4" strokeWidth={1.5} />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <DollarSign className="size-5" strokeWidth={1.5} />
            Log Donation
          </h1>
          <p className="text-sm text-muted-foreground">
            Manually record offline donations (checks, cash, Zelle, wire, Venmo). Use Cmd/Ctrl+Enter to save quickly.
          </p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Rapid Entry</CardTitle>
          <CardDescription>
            Keyboard-friendly form. Tab through fields. After saving, focus returns to donor search for repeat entry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Donor *</Label>
              <Tabs value={donorMode} onValueChange={(v) => setDonorMode(v as "search" | "create")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="search">Search existing</TabsTrigger>
                  <TabsTrigger value="create">Create new</TabsTrigger>
                </TabsList>
                <TabsContent value="search" className="mt-2 space-y-2">
                  <Popover open={donorPopoverOpen} onOpenChange={setDonorPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="donor"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={donorPopoverOpen}
                        className="w-full justify-between font-normal"
                      >
                        {donorId ? (
                          <span className="truncate">{donorDisplayName}</span>
                        ) : (
                          <span className="text-muted-foreground">Search donor by name or email…</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="flex flex-col">
                        <Input
                          ref={donorInputRef}
                          placeholder="Type to search…"
                          value={donorSearchQuery}
                          onChange={(e) => setDonorSearchQuery(e.target.value)}
                          className="rounded-b-none border-0 border-b"
                          autoFocus
                        />
                        <div className="max-h-[220px] overflow-y-auto">
                          {donorSearching && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
                          {!donorSearching && !donorSearchQuery.trim() && (
                            <p className="p-3 text-sm text-muted-foreground">Type to find donors by name or email.</p>
                          )}
                          {!donorSearching && donorSearchQuery.trim() && donorSearchResults.length === 0 && (
                            <p className="p-3 text-sm text-muted-foreground">No donors found.</p>
                          )}
                          {!donorSearching &&
                            donorSearchResults.map((d) => (
                              <div
                                key={d.id}
                                role="button"
                                tabIndex={0}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none cursor-pointer"
                                onClick={() => selectDonor(d)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    selectDonor(d)
                                  }
                                }}
                              >
                                {d.display_name ?? "Unknown"}
                              </div>
                            ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {donorId && (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground -mt-1" onClick={clearDonor}>
                      Clear
                    </Button>
                  )}
                </TabsContent>
                <TabsContent value="create" className="mt-2 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-donor-type">Donor type</Label>
                    <Select value={newDonorType} onValueChange={(v) => setNewDonorType(v as typeof newDonorType)}>
                      <SelectTrigger id="new-donor-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DONOR_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Institutional (corporate/school/church) donors receive non-deductible acknowledgments.
                    </p>
                  </div>
                  {isNewDonorIndividual ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="new-first-name">First name *</Label>
                        <Input
                          id="new-first-name"
                          placeholder="Jane"
                          value={newDonorFirstName}
                          onChange={(e) => setNewDonorFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-last-name">Last name</Label>
                        <Input
                          id="new-last-name"
                          placeholder="Smith"
                          value={newDonorLastName}
                          onChange={(e) => setNewDonorLastName(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="new-display-name">Organization name *</Label>
                      <Input
                        id="new-display-name"
                        placeholder="e.g. Acme Corp"
                        value={newDonorDisplayName}
                        onChange={(e) => setNewDonorDisplayName(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      placeholder="optional"
                      value={newDonorEmail}
                      onChange={(e) => setNewDonorEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-phone">Phone</Label>
                    <Input
                      id="new-phone"
                      type="tel"
                      placeholder="optional"
                      value={newDonorPhone}
                      onChange={(e) => setNewDonorPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-address">Address</Label>
                    <Input
                      id="new-address"
                      placeholder="optional"
                      value={newDonorAddress}
                      onChange={(e) => setNewDonorAddress(e.target.value)}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($) *</Label>
                <Input
                  id="amount"
                  ref={amountInputRef}
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger id="payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <div className="flex gap-1">
                  <Select value={categoryId || "__none__"} onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}>
                    <SelectTrigger id="category" className="flex-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      setAddOptionType("category")
                      setAddOptionName("")
                    }}
                    title="Add category"
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign">Campaign</Label>
                <div className="flex gap-1">
                  <Select value={campaignId || "__none__"} onValueChange={(v) => setCampaignId(v === "__none__" ? "" : v)}>
                    <SelectTrigger id="campaign" className="flex-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      setAddOptionType("campaign")
                      setAddOptionName("")
                    }}
                    title="Add campaign"
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fund">Fund</Label>
                <div className="flex gap-1">
                  <Select value={fundId || "__none__"} onValueChange={(v) => setFundId(v === "__none__" ? "" : v)}>
                    <SelectTrigger id="fund" className="flex-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {funds.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      setAddOptionType("fund")
                      setAddOptionName("")
                    }}
                    title="Add fund"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            <Dialog open={!!addOptionType} onOpenChange={(o) => !o && setAddOptionType(null)}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    Add {addOptionType === "category" ? "Category" : addOptionType === "campaign" ? "Campaign" : "Fund"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-option-name">Name</Label>
                    <Input
                      id="add-option-name"
                      value={addOptionName}
                      onChange={(e) => setAddOptionName(e.target.value)}
                      placeholder="e.g. General Fund"
                      onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOptionType(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddOption} disabled={addOptionSaving || !addOptionName.trim()}>
                    {addOptionSaving ? "Adding…" : "Add"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo / Note</Label>
              <Textarea
                id="memo"
                placeholder="Optional note"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Log Donation"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard?view=donations")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
