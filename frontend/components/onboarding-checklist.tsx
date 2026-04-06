"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Circle, Link2, FileSpreadsheet, Mail, FileText, X } from "lucide-react"
import { getOnboardingProgress, type OnboardingProgress } from "@/app/actions/onboarding-progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const DISMISS_KEY = "vantage-checklist-dismissed"

type ChecklistItem = {
  label: string
  done: boolean
  href?: string
  actionLabel?: string
  icon: React.ElementType
}

function buildChecklist(progress: OnboardingProgress): ChecklistItem[] {
  return [
    {
      label: "Create your account",
      done: true,
      icon: Check,
    },
    {
      label: "Import your donors",
      done: progress.hasDonors,
      href: "/settings?tab=integrations",
      actionLabel: "Import",
      icon: FileSpreadsheet,
    },
    {
      label: "Connect QuickBooks",
      done: progress.hasQBConnected,
      href: "/settings?tab=integrations",
      actionLabel: "Connect",
      icon: Link2,
    },
    {
      label: "Send your first email",
      done: progress.hasSentEmail,
      href: "/dashboard/donors",
      actionLabel: "Go to donors",
      icon: Mail,
    },
    {
      label: "Create an email template",
      done: progress.hasTemplate,
      href: "/settings?tab=email-templates",
      actionLabel: "Create",
      icon: FileText,
    },
  ]
}

export function OnboardingChecklist() {
  const router = useRouter()
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "true"
    setDismissed(wasDismissed)
    if (wasDismissed) {
      setLoading(false)
      return
    }
    getOnboardingProgress().then((p) => {
      setProgress(p)
      setLoading(false)
    })
  }, [])

  if (loading || dismissed || !progress) return null

  const items = buildChecklist(progress)
  const completedCount = items.filter((i) => i.done).length
  const allDone = completedCount === items.length

  if (allDone) return null

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "true")
    setDismissed(true)
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Get started with Vantage</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {completedCount} of {items.length} steps completed
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={handleDismiss}
        >
          <X className="size-4" strokeWidth={1.5} />
          <span className="sr-only">Dismiss</span>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              {item.done ? (
                <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" strokeWidth={2} />
                </div>
              ) : (
                <Circle className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
              )}
              <span
                className={
                  item.done
                    ? "flex-1 text-sm text-muted-foreground line-through"
                    : "flex-1 text-sm text-foreground"
                }
              >
                {item.label}
              </span>
              {!item.done && item.href && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => router.push(item.href!)}
                >
                  {item.actionLabel}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
