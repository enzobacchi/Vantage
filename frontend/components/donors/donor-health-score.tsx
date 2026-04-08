"use client"

import * as React from "react"
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency } from "@/lib/format"
import {
  getScoreColor,
  getScoreBgColor,
  type DonorHealthScore,
  type ScoreLabel,
} from "@/lib/donor-score"
import { cn } from "@/lib/utils"

function TrendIcon({ trend }: { trend: DonorHealthScore["trend"] }) {
  switch (trend) {
    case "rising":
      return <ArrowUpRight className="size-3.5 text-emerald-500" strokeWidth={1.5} />
    case "declining":
      return <ArrowDownRight className="size-3.5 text-red-500" strokeWidth={1.5} />
    case "stable":
      return <ArrowRight className="size-3.5 text-blue-500" strokeWidth={1.5} />
    default:
      return <Minus className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
  }
}

function trendLabel(trend: DonorHealthScore["trend"]): string {
  switch (trend) {
    case "rising": return "Giving is growing"
    case "declining": return "Giving is declining"
    case "stable": return "Giving is steady"
    case "new": return "New donor"
    case "inactive": return "No recent activity"
  }
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference
  const color = getScoreColor(score)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-lg font-bold tabular-nums", color)}>
          {score}
        </span>
      </div>
    </div>
  )
}

function FactorBar({
  label,
  value,
  tooltip,
}: {
  label: string
  value: number
  tooltip: string
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums font-medium">{value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/50">
              <div
                className={cn("h-full rounded-full transition-all", {
                  "bg-emerald-500": value >= 70,
                  "bg-blue-500": value >= 50 && value < 70,
                  "bg-amber-500": value >= 30 && value < 50,
                  "bg-red-500": value < 30,
                })}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-48 text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * DonorHealthScoreCard — shows the engagement score on a donor profile.
 * Fetches the score on mount from /api/donors/[id]/score.
 */
export function DonorHealthScoreCard({ donorId }: { donorId: string }) {
  const [data, setData] = React.useState<DonorHealthScore | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setError(false)
      setLoading(true)
      try {
        const res = await fetch(`/api/donors/${donorId}/score`)
        if (!res.ok) throw new Error("Failed to load score")
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [donorId])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="size-4" strokeWidth={1.5} />
            Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="size-4" strokeWidth={1.5} />
            Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Unable to load health score</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setError(false)
                setLoading(true)
                fetch(`/api/donors/${donorId}/score`)
                  .then(r => r.ok ? r.json() : Promise.reject())
                  .then(setData)
                  .catch(() => setError(true))
                  .finally(() => setLoading(false))
              }}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="size-4" strokeWidth={1.5} />
          Health Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score ring + label + trend */}
        <div className="flex items-center gap-4">
          <ScoreRing score={data.score} />
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold", getScoreColor(data.score))}>
              {data.label}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TrendIcon trend={data.trend} />
              <span className="text-xs text-muted-foreground">
                {trendLabel(data.trend)}
              </span>
            </div>
            {data.suggestedAsk && (
              <div className="mt-2 flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-xs text-muted-foreground">
                  Suggested ask:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(data.suggestedAsk)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="space-y-2.5">
          <FactorBar
            label="Recency"
            value={data.factors.recency}
            tooltip="How recently they last gave. 100 = gave today, 0 = 24+ months ago."
          />
          <FactorBar
            label="Frequency"
            value={data.factors.frequency}
            tooltip="How often they give. 12+ gifts in 2 years = 100."
          />
          <FactorBar
            label="Giving Trend"
            value={data.factors.monetary}
            tooltip="Is their giving growing, steady, or declining over time?"
          />
          <FactorBar
            label="Engagement"
            value={data.factors.engagement}
            tooltip="Interactions (calls, emails, meetings) in the last 12 months."
          />
          <FactorBar
            label="Consistency"
            value={data.factors.consistency}
            tooltip="How regular are their giving intervals? Monthly givers score highest."
          />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact inline score badge for use in tables and lists.
 */
export function ScoreBadge({
  score,
  label,
  className,
}: {
  score: number
  label?: ScoreLabel
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              getScoreBgColor(score),
              getScoreColor(score),
              className
            )}
          >
            {score}
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          Health Score: {score}/100{label ? ` (${label})` : ""}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
