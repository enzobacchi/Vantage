 "use client"

import * as React from "react"

import { useNav } from "@/components/nav-context"
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type RecentDonation = {
  id: string
  donor_id: string
  donor_name: string | null
  amount: number | null
  date: string | null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? "D") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")
}

function formatCurrency(amount: number | null) {
  if (amount == null) return "—"
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

export function RecentGifts() {
  const { openDonor } = useNav()
  const [gifts, setGifts] = React.useState<RecentDonation[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/donations/recent")
        const data = (await res.json()) as unknown
        if (!res.ok) {
          const msg =
            typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
          throw new Error(msg || `Failed to load recent gifts (HTTP ${res.status}).`)
        }
        if (cancelled) return
        setGifts(Array.isArray(data) ? (data as RecentDonation[]) : [])
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load recent gifts.")
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="h-full bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardTitle>Recent Gifts</CardTitle>
        <CardDescription>Latest donations received</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : gifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gifts yet.</p>
          ) : (
            gifts.slice(0, 8).map((gift) => {
              const name = gift.donor_name ?? "Unknown"
              return (
                <div key={gift.id} className="flex items-center gap-3">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openDonor(gift.donor_id)}
                      className="text-left text-sm font-medium leading-none truncate text-primary hover:underline block w-full"
                    >
                      {name}
                    </button>
                    <p className="text-xs text-muted-foreground truncate">
                      {gift.date ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 font-medium text-slate-900 dark:text-white text-sm whitespace-nowrap">
                    {formatCurrency(gift.amount)}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
