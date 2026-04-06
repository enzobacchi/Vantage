"use client"

import * as React from "react"
import {
  AlertTriangle,
  Heart,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DailyInsight } from "@/app/api/dashboard/insights/route"

function insightIcon(icon: DailyInsight["icon"]) {
  switch (icon) {
    case "trending_up":
      return <TrendingUp className="size-4 text-emerald-500" strokeWidth={1.5} />
    case "heart":
      return <Heart className="size-4 text-pink-500" strokeWidth={1.5} />
    case "alert":
      return <AlertTriangle className="size-4 text-amber-500" strokeWidth={1.5} />
    case "star":
      return <Star className="size-4 text-blue-500" strokeWidth={1.5} />
    default:
      return <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.5} />
  }
}

export function DailyInsights() {
  const [insights, setInsights] = React.useState<DailyInsight[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/dashboard/insights")
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setInsights(data.insights ?? [])
      } catch {
        if (!cancelled) setInsights([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const cardClass = "bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card"

  if (loading) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="size-4" strokeWidth={1.5} />
            Daily Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-5 rounded-full shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="size-4" strokeWidth={1.5} />
          Daily Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {insights.map((insight) => (
            <li key={insight.id} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">{insightIcon(insight.icon)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{insight.headline}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {insight.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
