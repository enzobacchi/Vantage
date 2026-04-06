"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Heart,
  ListTodo,
  Send,
  Target,
  UserMinus,
  X,
  Zap,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { SmartAction } from "@/app/api/dashboard/smart-actions/route"

function actionIcon(type: SmartAction["type"]) {
  switch (type) {
    case "thank_donor":
      return <Heart className="size-4 text-pink-500" strokeWidth={1.5} />
    case "at_risk":
      return <AlertTriangle className="size-4 text-amber-500" strokeWidth={1.5} />
    case "re_engage":
      return <UserMinus className="size-4 text-orange-500" strokeWidth={1.5} />
    case "pipeline":
      return <Target className="size-4 text-blue-500" strokeWidth={1.5} />
    case "task_overdue":
      return <ListTodo className="size-4 text-red-500" strokeWidth={1.5} />
    case "follow_up":
      return <Send className="size-4 text-violet-500" strokeWidth={1.5} />
    case "milestone":
      return <CheckCircle2 className="size-4 text-emerald-500" strokeWidth={1.5} />
    default:
      return <Zap className="size-4 text-muted-foreground" strokeWidth={1.5} />
  }
}

function priorityDot(priority: SmartAction["priority"]) {
  return (
    <span
      className={cn("size-1.5 rounded-full shrink-0", {
        "bg-red-500": priority === "high",
        "bg-amber-500": priority === "medium",
        "bg-muted-foreground": priority === "low",
      })}
    />
  )
}

const DISMISSED_KEY = "vantage-dismissed-actions"

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {}
}

export function SmartActions() {
  const [actions, setActions] = React.useState<SmartAction[]>([])
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const router = useRouter()

  const VISIBLE_COUNT = 4

  React.useEffect(() => {
    setDismissed(getDismissed())
  }, [])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/dashboard/smart-actions")
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setActions(data.actions ?? [])
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function dismiss(id: string) {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    saveDismissed(next)
  }

  const cardClass = "bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card"

  if (loading) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="size-4" strokeWidth={1.5} />
            Suggested Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-8 rounded-md shrink-0" />
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

  const visibleActions = actions.filter(a => !dismissed.has(a.id))

  if (error || visibleActions.length === 0) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="size-4" strokeWidth={1.5} />
            Suggested Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="size-8 text-emerald-500 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="text-xs text-muted-foreground mt-1">
              No urgent actions right now. Great work!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="size-4" strokeWidth={1.5} />
          Suggested Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {(expanded ? visibleActions : visibleActions.slice(0, VISIBLE_COUNT)).map((action) => (
            <li key={action.id} className="group/action relative">
              <button
                type="button"
                className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent group pr-8"
                onClick={() => {
                  if (action.donorId) {
                    router.push(`/dashboard/donors/${action.donorId}`)
                  } else if (action.type === "pipeline") {
                    router.push("/dashboard/pipeline")
                  } else if (action.type === "task_overdue") {
                    router.push("/dashboard?view=tasks")
                  } else if (action.type === "re_engage") {
                    router.push("/dashboard?view=donor-crm")
                  } else {
                    router.push("/dashboard?view=donor-crm")
                  }
                }}
              >
                <span className="mt-0.5 shrink-0">{actionIcon(action.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5">{priorityDot(action.priority)}</span>
                    <p className="text-sm font-medium line-clamp-2">{action.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                title="Dismiss"
                className="absolute right-2 top-2.5 size-5 flex items-center justify-center rounded opacity-0 group-hover/action:opacity-100 hover:bg-muted transition-opacity"
                onClick={(e) => { e.stopPropagation(); dismiss(action.id) }}
              >
                <X className="size-3 text-muted-foreground" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
        {visibleActions.length > VISIBLE_COUNT && (
          <button
            type="button"
            className="w-full flex items-center justify-center gap-1.5 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" strokeWidth={1.5} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-3" strokeWidth={1.5} />
                View all {visibleActions.length} actions
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
