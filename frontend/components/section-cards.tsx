 "use client"

import * as React from "react"
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from "@/components/ui/skeleton"

type DashboardMetrics = {
  totalDonors: number
  totalRevenue: number
  averageGift: number
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" })
}

export function SectionCards() {
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setError(null)
        const res = await fetch("/api/dashboard/metrics")
        const data = (await res.json()) as unknown
        if (!res.ok) {
          const msg =
            typeof data === "object" && data && "error" in data ? String((data as any).error) : ""
          throw new Error(msg || `Failed to load metrics (HTTP ${res.status}).`)
        }
        if (cancelled) return
        setMetrics(data as DashboardMetrics)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load dashboard metrics.")
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Revenue</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics ? (
              formatCurrency(metrics.totalRevenue)
            ) : (
              <Skeleton className="h-8 w-40 @[250px]/card:h-9" />
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Based on synced QuickBooks totals
          </div>
          <div className="text-muted-foreground">
            {error ? error : " " }
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Donors</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics ? (
              metrics.totalDonors.toLocaleString()
            ) : (
              <Skeleton className="h-8 w-24 @[250px]/card:h-9" />
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Donors in Supabase
          </div>
          <div className="text-muted-foreground">
            Updated from your latest sync
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average Gift</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metrics ? (
              formatCurrency(metrics.averageGift)
            ) : (
              <Skeleton className="h-8 w-32 @[250px]/card:h-9" />
            )}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingDown />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Revenue / Donors
          </div>
          <div className="text-muted-foreground">More small gifts received</div>
        </CardFooter>
      </Card>
      </div>
  )
}
