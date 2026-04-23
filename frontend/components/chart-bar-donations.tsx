"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
import { formatCurrency } from "@/lib/format"

type DonationTrendPoint = { month: string; total: number }

const chartConfig = {
  total: {
    label: "Total",
    color: "#21E0D6",
  },
} satisfies ChartConfig

function ChartSkeleton() {
  return (
    <div className="flex h-[250px] w-full items-center gap-2 px-2 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-col justify-between h-full pb-8 pr-2">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
        <Skeleton className="h-3 w-8" />
      </div>
      <div className="flex flex-1 h-[180px] items-end">
        <Skeleton className="h-full w-full rounded" />
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
    <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs h-full">
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
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ left: 12, right: 12, top: 12 }}
            >
              <defs>
                <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#21E0D6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#007A3F" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="strokeTotal" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#007A3F" />
                  <stop offset="100%" stopColor="#21E0D6" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
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
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatCurrency(Number(value))}
                    indicator="line"
                  />
                }
              />
              <Area
                dataKey="total"
                type="natural"
                fill="url(#fillTotal)"
                stroke="url(#strokeTotal)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
