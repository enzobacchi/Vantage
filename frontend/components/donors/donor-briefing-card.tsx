"use client"

import * as React from "react"
import { HandCoins, MessageCircle, Sparkles, ListChecks } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DonorBriefing } from "@/lib/donor-briefing"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

type Status = "idle" | "loading" | "ready" | "error"

/**
 * AI pre-visit briefing: giving history, last conversation, what to talk about.
 * Generated on demand (each call counts against the plan's AI-insights quota);
 * pass `autoGenerate` where opening the surface is itself the request, e.g.
 * the map's "AI Briefing" sheet.
 */
export function DonorBriefingCard({
  donorId,
  autoGenerate = false,
  className,
}: {
  donorId: string
  autoGenerate?: boolean
  className?: string
}) {
  // State is tagged with the donor it belongs to, so switching donors shows a
  // fresh card without a reset effect.
  const [state, setState] = React.useState<{
    donorId: string
    status: Status
    briefing: DonorBriefing | null
    error: string | null
  }>({ donorId, status: "idle", briefing: null, error: null })
  const requestRef = React.useRef<AbortController | null>(null)

  const current = state.donorId === donorId ? state : null
  const status: Status = current?.status ?? "idle"
  const briefing = current?.briefing ?? null
  const error = current?.error ?? null

  const generate = React.useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setState((prev) => ({
      donorId,
      status: "loading",
      briefing: prev.donorId === donorId ? prev.briefing : null,
      error: null,
    }))
    try {
      const res = await fetch(`/api/donors/${donorId}/insights`, { signal: controller.signal })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? "Couldn't prepare the briefing. Please try again.")
      }
      setState({ donorId, status: "ready", briefing: body as DonorBriefing, error: null })
    } catch (err) {
      if (controller.signal.aborted) return
      setState({
        donorId,
        status: "error",
        briefing: null,
        error: err instanceof Error ? err.message : "Couldn't prepare the briefing. Please try again.",
      })
    }
  }, [donorId])

  // Abort any in-flight request when the donor changes or on unmount.
  React.useEffect(() => () => requestRef.current?.abort(), [donorId])

  // Surfaces where opening IS the request (the map's briefing sheet) fetch on mount.
  const autoRequested = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!autoGenerate || autoRequested.current === donorId) return
    // Mark inside the timer so a StrictMode mount/unmount/mount still fires once.
    const t = setTimeout(() => {
      autoRequested.current = donorId
      void generate()
    }, 0)
    return () => clearTimeout(t)
  }, [autoGenerate, donorId, generate])

  const loading = status === "loading"

  return (
    <section
      aria-label="AI briefing"
      className={cn("@container rounded-xl bg-gradient-to-r from-[#007A3F] to-[#21E0D6] p-[1px]", className)}
    >
      <div className="rounded-[11px] bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
              <Sparkles className="size-4 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-semibold leading-tight text-foreground">
                AI Briefing
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Giving history, last conversation, and what to talk about.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 border-0 bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 shadow-sm"
            onClick={() => void generate()}
            disabled={loading}
          >
            {loading ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" strokeWidth={1.5} />}
            {status === "ready" ? "Refresh" : loading ? "Preparing…" : "Get briefing"}
          </Button>
        </div>

        {loading && <BriefingSkeleton />}

        {status === "error" && error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {status === "ready" && briefing && (
          <div className="mt-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
            {briefing.summary && (
              <p className="max-w-[75ch] text-[15px] leading-relaxed text-foreground text-pretty">
                {briefing.summary}
              </p>
            )}
            <div className="mt-4 grid gap-5 @3xl:grid-cols-3 @3xl:gap-0 @3xl:divide-x @3xl:divide-border">
              <BriefingSection icon={HandCoins} title="Giving history" className="@3xl:pr-5">
                <p>{briefing.givingHistory || "No gifts recorded yet."}</p>
              </BriefingSection>
              <BriefingSection icon={MessageCircle} title="Last conversation" className="@3xl:px-5">
                <p>{briefing.lastConversation ?? "No conversations logged yet — this visit is a first touch."}</p>
              </BriefingSection>
              <BriefingSection icon={ListChecks} title="Talk about" className="@3xl:pl-5">
                {briefing.talkingPoints.length > 0 ? (
                  <ol className="space-y-1.5">
                    {briefing.talkingPoints.map((point, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-[11px] font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                          {i + 1}
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Ask how they&apos;d like to be involved this year.</p>
                )}
              </BriefingSection>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function BriefingSection({
  icon: Icon,
  title,
  className,
  children,
}: {
  icon: React.ElementType
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.5} />
        {title}
      </h4>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  )
}

function BriefingSkeleton() {
  return (
    <div className="mt-5 space-y-4" aria-busy="true" aria-label="Preparing briefing">
      <Skeleton className="h-4 w-3/4" />
      <div className="grid gap-5 @3xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  )
}
