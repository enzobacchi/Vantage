"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

type InsightsData = {
  summary: string
  insights: string[]
  nextSteps: string[]
}

/**
 * Compact AI insights widget for the CRM side-panel.
 * On-demand generation to stay cost-conscious.
 */
export function DonorInsightsPanel({ donorId }: { donorId: string }) {
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/donors/${donorId}/insights`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to generate insights")
      }
      const json: InsightsData = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!data && !loading && !error) {
    return (
      <Card>
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground">AI Insights</span>
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={generate}
          >
            Generate →
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-medium text-foreground">AI Insights</span>
          </div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            onClick={generate}
            disabled={loading}
          >
            {loading ? <Spinner className="size-3" /> : "Refresh →"}
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Spinner className="size-3" />
            Analyzing donor data...
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {data && !loading && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground leading-relaxed">{data.summary}</p>

            {(data.insights.length > 0 || data.nextSteps.length > 0) && (
              <ul className="space-y-0.5">
                {data.insights.map((insight, i) => (
                  <li key={`insight-${i}`} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/60 mt-px shrink-0">•</span>
                    {insight}
                  </li>
                ))}
                {data.nextSteps.map((step, i) => (
                  <li key={`step-${i}`} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-muted-foreground/60 mt-px shrink-0">•</span>
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
