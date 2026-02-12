"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from '@/hooks/use-mobile'
import {
  Card,
  CardAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'

export const description = "An interactive area chart"

const chartData = [
  { date: "2024-04-01", online: 2220, offline: 1500 },
  { date: "2024-04-02", online: 970, offline: 1800 },
  { date: "2024-04-03", online: 1670, offline: 1200 },
  { date: "2024-04-04", online: 2420, offline: 2600 },
  { date: "2024-04-05", online: 3730, offline: 2900 },
  { date: "2024-04-06", online: 3010, offline: 3400 },
  { date: "2024-04-07", online: 2450, offline: 1800 },
  { date: "2024-04-08", online: 4090, offline: 3200 },
  { date: "2024-04-09", online: 590, offline: 1100 },
  { date: "2024-04-10", online: 2610, offline: 1900 },
  { date: "2024-04-11", online: 3270, offline: 3500 },
  { date: "2024-04-12", online: 2920, offline: 2100 },
  { date: "2024-04-13", online: 3420, offline: 3800 },
  { date: "2024-04-14", online: 1370, offline: 2200 },
  { date: "2024-04-15", online: 1200, offline: 1700 },
  { date: "2024-04-16", online: 1380, offline: 1900 },
  { date: "2024-04-17", online: 4460, offline: 3600 },
  { date: "2024-04-18", online: 3640, offline: 4100 },
  { date: "2024-04-19", online: 2430, offline: 1800 },
  { date: "2024-04-20", online: 890, offline: 1500 },
  { date: "2024-04-21", online: 1370, offline: 2000 },
  { date: "2024-04-22", online: 2240, offline: 1700 },
  { date: "2024-04-23", online: 1380, offline: 2300 },
  { date: "2024-04-24", online: 3870, offline: 2900 },
  { date: "2024-04-25", online: 2150, offline: 2500 },
  { date: "2024-04-26", online: 750, offline: 1300 },
  { date: "2024-04-27", online: 3830, offline: 4200 },
  { date: "2024-04-28", online: 1220, offline: 1800 },
  { date: "2024-04-29", online: 3150, offline: 2400 },
  { date: "2024-04-30", online: 4540, offline: 3800 },
  { date: "2024-05-01", online: 1650, offline: 2200 },
  { date: "2024-05-02", online: 2930, offline: 3100 },
  { date: "2024-05-03", online: 2470, offline: 1900 },
  { date: "2024-05-04", online: 3850, offline: 4200 },
  { date: "2024-05-05", online: 4810, offline: 3900 },
  { date: "2024-05-06", online: 4980, offline: 5200 },
  { date: "2024-05-07", online: 3880, offline: 3000 },
  { date: "2024-05-08", online: 1490, offline: 2100 },
  { date: "2024-05-09", online: 2270, offline: 1800 },
  { date: "2024-05-10", online: 2930, offline: 3300 },
  { date: "2024-05-11", online: 3350, offline: 2700 },
  { date: "2024-05-12", online: 1970, offline: 2400 },
  { date: "2024-05-13", online: 1970, offline: 1600 },
  { date: "2024-05-14", online: 4480, offline: 4900 },
  { date: "2024-05-15", online: 4730, offline: 3800 },
  { date: "2024-05-16", online: 3380, offline: 4000 },
  { date: "2024-05-17", online: 4990, offline: 4200 },
  { date: "2024-05-18", online: 3150, offline: 3500 },
  { date: "2024-05-19", online: 2350, offline: 1800 },
  { date: "2024-05-20", online: 1770, offline: 2300 },
  { date: "2024-05-21", online: 820, offline: 1400 },
  { date: "2024-05-22", online: 810, offline: 1200 },
  { date: "2024-05-23", online: 2520, offline: 2900 },
  { date: "2024-05-24", online: 2940, offline: 2200 },
  { date: "2024-05-25", online: 2010, offline: 2500 },
  { date: "2024-05-26", online: 2130, offline: 1700 },
  { date: "2024-05-27", online: 4200, offline: 4600 },
  { date: "2024-05-28", online: 2330, offline: 1900 },
  { date: "2024-05-29", online: 780, offline: 1300 },
  { date: "2024-05-30", online: 3400, offline: 2800 },
  { date: "2024-05-31", online: 1780, offline: 2300 },
  { date: "2024-06-01", online: 1780, offline: 2000 },
  { date: "2024-06-02", online: 4700, offline: 4100 },
  { date: "2024-06-03", online: 1030, offline: 1600 },
  { date: "2024-06-04", online: 4390, offline: 3800 },
  { date: "2024-06-05", online: 880, offline: 1400 },
  { date: "2024-06-06", online: 2940, offline: 2500 },
  { date: "2024-06-07", online: 3230, offline: 3700 },
  { date: "2024-06-08", online: 3850, offline: 3200 },
  { date: "2024-06-09", online: 4380, offline: 4800 },
  { date: "2024-06-10", online: 1550, offline: 2000 },
  { date: "2024-06-11", online: 920, offline: 1500 },
  { date: "2024-06-12", online: 4920, offline: 4200 },
  { date: "2024-06-13", online: 810, offline: 1300 },
  { date: "2024-06-14", online: 4260, offline: 3800 },
  { date: "2024-06-15", online: 3070, offline: 3500 },
  { date: "2024-06-16", online: 3710, offline: 3100 },
  { date: "2024-06-17", online: 4750, offline: 5200 },
  { date: "2024-06-18", online: 1070, offline: 1700 },
  { date: "2024-06-19", online: 3410, offline: 2900 },
  { date: "2024-06-20", online: 4080, offline: 4500 },
  { date: "2024-06-21", online: 1690, offline: 2100 },
  { date: "2024-06-22", online: 3170, offline: 2700 },
  { date: "2024-06-23", online: 4800, offline: 5300 },
  { date: "2024-06-24", online: 1320, offline: 1800 },
  { date: "2024-06-25", online: 1410, offline: 1900 },
  { date: "2024-06-26", online: 4340, offline: 3800 },
  { date: "2024-06-27", online: 4480, offline: 4900 },
  { date: "2024-06-28", online: 1490, offline: 2000 },
  { date: "2024-06-29", online: 1030, offline: 1600 },
  { date: "2024-06-30", online: 4460, offline: 4000 },
]

const chartConfig = {
  donations: {
    label: "Donations",
  },
  online: {
    label: "Online",
    color: "var(--primary)",
  },
  offline: {
    label: "In-Person",
    color: "var(--primary)",
  },
} satisfies ChartConfig

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date)
    const referenceDate = new Date("2024-06-30")
    let daysToSubtract = 90
    if (timeRange === "30d") {
      daysToSubtract = 30
    } else if (timeRange === "7d") {
      daysToSubtract = 7
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Donation Trends</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Donation activity for the last 3 months
          </span>
          <span className="@[540px]/card:hidden">Last 3 months</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id="fillOnline" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-online)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-online)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillOffline" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-offline)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-offline)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="offline"
              type="natural"
              fill="url(#fillOffline)"
              stroke="var(--color-offline)"
              stackId="a"
            />
            <Area
              dataKey="online"
              type="natural"
              fill="url(#fillOnline)"
              stroke="var(--color-online)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
