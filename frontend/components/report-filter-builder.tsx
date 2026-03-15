"use client"

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export type FilterRow = {
  id: string
  field: string
  operator: string
  value: string | number | string[]
  value2?: string | number
}

const PERIOD_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "this_year", label: "This Year (YTD)" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
] as const

type ReportFilterBuilderProps = {
  filters: FilterRow[]
  onChange: (filters: FilterRow[]) => void
  states?: string[]
  initialFilters?: FilterRow[] | null
}

function nextId() {
  return crypto.randomUUID?.() ?? String(Date.now())
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "__any__", label: "Any" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "wire", label: "Wire" },
  { value: "venmo", label: "Venmo" },
  { value: "other", label: "Other" },
  { value: "quickbooks", label: "QuickBooks" },
]

/** Convert form state to FilterRow[] for the API. */
function formToFilters(values: {
  period: string
  customStart: string
  customEnd: string
  minDonation: string
  maxDonation: string
  atLeastOneGift: boolean
  paymentMethod: string
  city: string
  state: string
  zip: string
}): FilterRow[] {
  const filters: FilterRow[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const firstOfMonth = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const janFirst = `${currentYear}-01-01`

  // Time frame
  if (values.period === "this_year") {
    filters.push({
      id: nextId(),
      field: "last_donation_date",
      operator: "gte",
      value: janFirst,
    })
  } else if (values.period === "this_month") {
    filters.push({
      id: nextId(),
      field: "last_donation_date",
      operator: "gte",
      value: firstOfMonth,
    })
  } else if (values.period === "custom" && values.customStart && values.customEnd) {
    filters.push({
      id: nextId(),
      field: "last_donation_date",
      operator: "between",
      value: values.customStart,
      value2: values.customEnd,
    })
  }

  // Financials
  const minNum = values.minDonation.trim() ? Number(values.minDonation) : NaN
  const maxNum = values.maxDonation.trim() ? Number(values.maxDonation) : NaN
  if (Number.isFinite(minNum) && minNum > 0) {
    filters.push({
      id: nextId(),
      field: "total_lifetime_value",
      operator: "gte",
      value: minNum,
    })
  }
  if (Number.isFinite(maxNum) && maxNum > 0) {
    filters.push({
      id: nextId(),
      field: "total_lifetime_value",
      operator: "lte",
      value: maxNum,
    })
  }
  if (values.atLeastOneGift) {
    filters.push({
      id: nextId(),
      field: "gift_count",
      operator: "gte",
      value: 1,
    })
  }
  if (values.paymentMethod && values.paymentMethod !== "__any__") {
    filters.push({
      id: nextId(),
      field: "payment_method",
      operator: "eq",
      value: values.paymentMethod.trim(),
    })
  }

  // Location
  const city = values.city.trim()
  if (city) {
    filters.push({
      id: nextId(),
      field: "city",
      operator: "contains",
      value: city,
    })
  }
  const state = values.state.trim()
  if (state) {
    filters.push({
      id: nextId(),
      field: "state",
      operator: "is_exactly",
      value: state,
    })
  }
  const zip = values.zip.trim()
  if (zip) {
    filters.push({
      id: nextId(),
      field: "zip",
      operator: "contains",
      value: zip,
    })
  }

  return filters
}

/** Convert FilterRow[] back to form state for pre-population. */
export function filtersToForm(filters: FilterRow[]): {
  period: string
  customStart: string
  customEnd: string
  minDonation: string
  maxDonation: string
  atLeastOneGift: boolean
  paymentMethod: string
  city: string
  state: string
  zip: string
} {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const firstOfMonth = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const janFirst = `${currentYear}-01-01`

  let period = "all"
  let customStart = ""
  let customEnd = ""
  let minDonation = ""
  let maxDonation = ""
  let atLeastOneGift = false
  let paymentMethod = ""
  let city = ""
  let state = ""
  let zip = ""

  for (const f of filters) {
    if (f.field === "last_donation_date") {
      if (f.operator === "gte" && f.value === janFirst) period = "this_year"
      else if (f.operator === "gte" && f.value === firstOfMonth) period = "this_month"
      else if (f.operator === "between" && f.value != null && f.value2 != null) {
        period = "custom"
        customStart = String(f.value)
        customEnd = String(f.value2)
      }
    } else if (f.field === "total_lifetime_value") {
      if (f.operator === "gte") minDonation = String(f.value)
      else if (f.operator === "lte") maxDonation = String(f.value)
    } else if (f.field === "gift_count" && f.operator === "gte" && f.value === 1) {
      atLeastOneGift = true
    } else if (f.field === "payment_method" && f.operator === "eq") {
      paymentMethod = String(f.value ?? "")
    } else if (f.field === "city" && f.operator === "contains") {
      city = String(f.value ?? "")
    } else if (f.field === "state" && f.operator === "is_exactly") {
      state = String(f.value ?? "")
    } else if (f.field === "zip" && f.operator === "contains") {
      zip = String(f.value ?? "")
    }
  }

  return { period, customStart, customEnd, minDonation, maxDonation, atLeastOneGift, paymentMethod, city, state, zip }
}

export function ReportFilterBuilder({ filters, onChange, states = [], initialFilters }: ReportFilterBuilderProps) {
  const [statesList, setStatesList] = React.useState<string[]>(states)
  const [period, setPeriod] = React.useState<string>("all")
  const [customStart, setCustomStart] = React.useState("")
  const [customEnd, setCustomEnd] = React.useState("")
  const [minDonation, setMinDonation] = React.useState("")
  const [maxDonation, setMaxDonation] = React.useState("")
  const [atLeastOneGift, setAtLeastOneGift] = React.useState(false)
  const [paymentMethod, setPaymentMethod] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [zip, setZip] = React.useState("")
  const [hasInitialized, setHasInitialized] = React.useState(false)

  React.useEffect(() => {
    if (hasInitialized || !initialFilters || initialFilters.length === 0) return
    const form = filtersToForm(initialFilters)
    setPeriod(form.period)
    setCustomStart(form.customStart)
    setCustomEnd(form.customEnd)
    setMinDonation(form.minDonation)
    setMaxDonation(form.maxDonation)
    setAtLeastOneGift(form.atLeastOneGift)
    setPaymentMethod(form.paymentMethod)
    setCity(form.city)
    setState(form.state)
    setZip(form.zip)
    setHasInitialized(true)
  }, [initialFilters, hasInitialized])

  React.useEffect(() => {
    if (states.length > 0) return
    fetch("/api/donors/states")
      .then((r) => r.json())
      .then((data) => (Array.isArray(data) ? data : []))
      .then(setStatesList)
      .catch(() => setStatesList([]))
  }, [states.length])

  React.useEffect(() => {
    const next = formToFilters({
      period,
      customStart,
      customEnd,
      minDonation,
      maxDonation,
      atLeastOneGift,
      paymentMethod,
      city,
      state,
      zip,
    })
    onChange(next)
  }, [
    period,
    customStart,
    customEnd,
    minDonation,
    maxDonation,
    atLeastOneGift,
    paymentMethod,
    city,
    state,
    zip,
    onChange,
  ])

  return (
    <div className="space-y-6">
      {/* Time Frame */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Time Frame</h4>
        <div className="space-y-2">
          <Label htmlFor="period">Period</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger id="period" className="w-full">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="custom-start">Start Date</Label>
                <Input
                  id="custom-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-end">End Date</Label>
                <Input
                  id="custom-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <hr className="border-border" />

      {/* Financials */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Financials</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="min-donation">Min Donation ($)</Label>
            <Input
              id="min-donation"
              type="number"
              min={0}
              step={1}
              placeholder="e.g. 500"
              value={minDonation}
              onChange={(e) => setMinDonation(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-donation">Max Donation ($)</Label>
            <Input
              id="max-donation"
              type="number"
              min={0}
              step={1}
              placeholder="e.g. 10000"
              value={maxDonation}
              onChange={(e) => setMaxDonation(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <Label htmlFor="at-least-one-gift" className="cursor-pointer">
            At least 1 gift
          </Label>
          <Switch
            id="at-least-one-gift"
            checked={atLeastOneGift}
            onCheckedChange={setAtLeastOneGift}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="payment-method">Payment Method</Label>
          <Select value={paymentMethod || "__any__"} onValueChange={(v) => setPaymentMethod(v === "__any__" ? "" : v)}>
            <SelectTrigger id="payment-method">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <hr className="border-border" />

      {/* Location */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Location</h4>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              type="text"
              placeholder="e.g. Detroit"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="state">State</Label>
            <Select value={state || "__none__"} onValueChange={(v) => setState(v === "__none__" ? "" : v)}>
              <SelectTrigger id="state">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any</SelectItem>
                {statesList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="zip">Zip</Label>
            <Input
              id="zip"
              type="text"
              placeholder="e.g. 48201"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
