"use client"

import * as React from "react"
import { Trophy } from "lucide-react"

import { useNav } from "@/components/nav-context"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getTopDonors, type TopDonorRow } from "@/app/actions/dashboard"

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "ytd", label: "This Year" },
  { value: "all", label: "All Time" },
] as const

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"]

function formatCurrency(amount: number) {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

function formatLastGift(date: string | null): string {
  if (!date) return "—"
  try {
    return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

export function TopDonorsWidget() {
  const { openDonor } = useNav()
  const [range, setRange] = React.useState<RangeValue>("all")
  const [donors, setDonors] = React.useState<TopDonorRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (r: RangeValue) => {
    setLoading(true)
    setError(null)
    try {
      const list = await getTopDonors(r)
      setDonors(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load top donors.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load(range)
  }, [range, load])

  return (
    <Card className="h-full bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle>Top Donors</CardTitle>
          <CardDescription>Your top supporters by giving in the selected period</CardDescription>
        </div>
        <Select
          value={range}
          onValueChange={(v) => setRange(v as RangeValue)}
        >
          <SelectTrigger className="w-[140px]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {loading ? (
          <ul className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-6 shrink-0" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16 shrink-0" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : donors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No donors in this period.</p>
        ) : (
          <ul className="space-y-3">
            {donors.map((d, index) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-transparent py-1.5 pr-2 transition-colors hover:bg-muted/50"
              >
                <span className="text-muted-foreground w-6 shrink-0 text-sm tabular-nums">
                  {index === 0 ? (
                    <Trophy className="size-4 text-amber-500" aria-label="Rank 1" />
                  ) : (
                    index + 1
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => openDonor(d.id)}
                  className="min-w-0 flex-1 text-left text-sm font-medium text-primary hover:underline"
                >
                  {d.display_name ?? "—"}
                </button>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(d.amount)}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatLastGift(d.last_donation_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
