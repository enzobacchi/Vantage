"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
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
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground">AI Insights</span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={generate}>
            Generate
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-zinc-500 shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-medium text-zinc-950">AI Insights</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={generate}
            disabled={loading}
          >
            {loading ? <Spinner className="size-3" /> : "Refresh"}
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-1">
            <Spinner className="size-3" />
            Analyzing donor data...
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {data && !loading && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 leading-relaxed">{data.summary}</p>

            {data.insights.length > 0 && (
              <ul className="space-y-0.5">
                {data.insights.map((insight, i) => (
                  <li key={i} className="text-xs text-zinc-500 flex items-start gap-1.5">
                    <span className="text-zinc-400 mt-px shrink-0">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            )}

            {data.nextSteps.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-zinc-950 uppercase tracking-wide mb-1">Next Steps</p>
                <ul className="space-y-0.5">
                  {data.nextSteps.map((step, i) => (
                    <li key={i} className="text-xs text-zinc-600 flex items-start gap-1.5">
                      <span className="text-emerald-600 mt-px shrink-0 font-medium">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
