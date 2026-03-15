"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

type InsightsData = {
  summary: string
  insights: string[]
  nextSteps: string[]
}

export function DonorInsightsCard({ donorId }: { donorId: string }) {
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

  return (
    <div className="rounded-xl bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] p-[1px]">
    <Card className="border-0">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-[#0ea5b8]" strokeWidth={1.5} />AI Insights</CardTitle>
            <CardDescription>
              AI-generated analysis of giving patterns and engagement
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="bg-gradient-to-r from-[#14b8a6] to-[#06b6d4] text-white shadow-sm hover:opacity-90 border-0"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <Spinner className="mr-2" />
            ) : (
              <Sparkles className="mr-2 size-4" strokeWidth={1.5} />
            )}
            {data ? "Refresh" : "Generate Insights"}
          </Button>
        </div>
      </CardHeader>

      {(data || loading || error) && (
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Spinner />
              Analyzing donor data...
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 py-2">{error}</p>
          )}

          {data && !loading && (
            <div className="space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                {data.summary}
              </p>

              {data.insights.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1.5">
                    Key Insights
                  </h4>
                  <ul className="space-y-1">
                    {data.insights.map((insight, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-muted-foreground/60 mt-0.5 shrink-0">•</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.nextSteps.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1.5">
                    Recommended Next Steps
                  </h4>
                  <ul className="space-y-1">
                    {data.nextSteps.map((step, i) => (
                      <li
                        key={i}
                        className="text-sm text-muted-foreground flex items-start gap-2"
                      >
                        <span className="text-emerald-600 mt-0.5 shrink-0 font-medium">
                          {i + 1}.
                        </span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
    </div>
  )
}
