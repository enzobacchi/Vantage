"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'

type DonationTrendPoint = { month: string; total: number }

const chartConfig = {
  total: {
    label: "Total",
    theme: {
      light: "oklch(0.145 0 0)",
      dark: "oklch(0.985 0 0)",
    },
  },
} satisfies ChartConfig

// Fixed heights so server and client render identically (avoids hydration mismatch).
const SKELETON_BAR_HEIGHTS = [82, 91, 86, 63, 129, 97, 64, 128, 114, 67, 90, 127]

function ChartSkeleton() {
  return (
    <div className="flex h-[250px] w-full items-end gap-2 px-2 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-col justify-between h-full pb-8 pr-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="flex flex-1 items-end justify-around pb-8">
        {SKELETON_BAR_HEIGHTS.map((h, i) => (
          <Skeleton
            key={i}
            className="w-4 sm:w-6"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </div>
  )
}

export function ChartBarDonations() {
  const [isLoading, setIsLoading] = React.useState(true)
  const [data, setData] = React.useState<DonationTrendPoint[]>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetch("/api/donations/trend")
        const json = (await res.json()) as unknown
        if (!res.ok) {
          const msg =
            typeof json === "object" && json && "error" in json ? String((json as any).error) : ""
          throw new Error(msg || `Failed to load trend (HTTP ${res.status}).`)
        }
        if (cancelled) return
        setData(Array.isArray(json) ? (json as DonationTrendPoint[]) : [])
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load donation trend.")
      } finally {
        if (cancelled) return
        setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardTitle>Revenue Trend</CardTitle>
        <CardDescription>
          Monthly donation totals (last 12 months)
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <p className="px-4 py-6 text-sm text-destructive">{error}</p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <BarChart data={data} barCategoryGap="12%">
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                fontSize={12}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value) => `$${Number(value).toLocaleString()}`}
                    indicator="dot"
                  />
                }
              />
              <Bar
                dataKey="total"
                fill="var(--color-total)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
