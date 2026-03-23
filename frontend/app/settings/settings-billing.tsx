"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  Check,
  CreditCard,
  ExternalLink,
  Sparkles,
  Database,
  Crown,
  AlertCircle,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

import { PLANS } from "@/lib/subscription"
import type { SubscriptionPlan } from "@/types/database"

type SubStatus = {
  subscription: {
    planId: SubscriptionPlan
    planName: string
    status: string
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  }
  limits: {
    maxDonors: number
    maxAiInsightsPerMonth: number
  }
  usage: {
    donors: number
    aiInsights: number
  }
  plan: {
    name: string
    description: string
    monthlyPrice: number
    features: string[]
  }
  hasStripeCustomer: boolean
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trialing: { label: "Trial", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  past_due: { label: "Past Due", variant: "destructive" },
  canceled: { label: "Canceled", variant: "destructive" },
  unpaid: { label: "Unpaid", variant: "destructive" },
}

const PLAN_ORDER: SubscriptionPlan[] = ["trial", "essentials", "growth", "pro"]

export function SettingsBilling() {
  const [data, setData] = React.useState<SubStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState<string | null>(null)
  const searchParams = useSearchParams()

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/status")
      if (!res.ok) throw new Error("Failed to load billing status")
      const json = (await res.json()) as SubStatus
      setData(json)
    } catch {
      toast.error("Could not load billing information")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // After Stripe checkout, the webhook may not have arrived yet — re-fetch after a short delay
  React.useEffect(() => {
    if (!searchParams.get("session_id")) return
    toast.success("Payment successful! Updating your plan...")
    const timer = setTimeout(() => fetchStatus(), 2000)
    return () => clearTimeout(timer)
  }, [searchParams, fetchStatus])

  async function handleCheckout(plan: SubscriptionPlan) {
    setActionLoading(plan)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (json.url) {
        window.location.href = json.url
      } else {
        toast.error(json.error ?? "Could not start checkout")
      }
    } catch {
      toast.error("Could not start checkout")
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePortal() {
    setActionLoading("portal")
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const json = (await res.json()) as { url?: string; error?: string }
      if (json.url) {
        window.location.href = json.url
      } else {
        toast.error(json.error ?? "Could not open billing portal")
      }
    } catch {
      toast.error("Could not open billing portal")
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
        <AlertCircle className="mx-auto size-12 text-muted-foreground/50" strokeWidth={1.5} />
        <h3 className="mt-4 text-lg font-semibold">Unable to load billing</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again later or contact support.
        </p>
      </div>
    )
  }

  const { subscription: sub, limits, usage, hasStripeCustomer } = data
  const statusInfo = STATUS_LABELS[sub.status] ?? { label: sub.status, variant: "outline" as const }
  const currentPlanIdx = PLAN_ORDER.indexOf(sub.planId)
  const isTrialing = sub.status === "trialing"
  const isCanceled = sub.status === "canceled"
  const trialDaysLeft = sub.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null

  // Usage alert thresholds
  const donorPct = limits.maxDonors > 0 ? Math.round((usage.donors / limits.maxDonors) * 100) : 0
  const aiPct = limits.maxAiInsightsPerMonth > 0 ? Math.round((usage.aiInsights / limits.maxAiInsightsPerMonth) * 100) : 0
  const alerts: { type: "warning" | "critical"; message: string }[] = []
  if (donorPct >= 100) {
    alerts.push({ type: "critical", message: `You've reached your donor limit (${usage.donors.toLocaleString()}/${limits.maxDonors.toLocaleString()}). Upgrade to add more donors.` })
  } else if (donorPct >= 80) {
    alerts.push({ type: "warning", message: `You're using ${donorPct}% of your donor limit (${usage.donors.toLocaleString()}/${limits.maxDonors.toLocaleString()}). Consider upgrading soon.` })
  }
  if (limits.maxAiInsightsPerMonth > 0) {
    if (aiPct >= 100) {
      alerts.push({ type: "critical", message: `You've used all ${limits.maxAiInsightsPerMonth} AI insights this month. Upgrade for more.` })
    } else if (aiPct >= 80) {
      alerts.push({ type: "warning", message: `You've used ${usage.aiInsights} of ${limits.maxAiInsightsPerMonth} AI insights this month (${aiPct}%). ` })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium">Billing</h3>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5">
          Manage your subscription, plan limits, and payment methods.
        </p>
      </div>

      {/* Current plan card */}
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Crown className="size-5" strokeWidth={1.5} />
              {sub.planName}
            </CardTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <CardDescription>
            {isTrialing && trialDaysLeft !== null && (
              <span>
                {trialDaysLeft === 0
                  ? "Your trial expires today. "
                  : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial. `}
                Upgrade to keep using Vantage.
              </span>
            )}
            {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
              <span>
                Your plan will be canceled on{" "}
                {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </span>
            )}
            {!isTrialing && !isCanceled && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
              <span>
                Renews on{" "}
                {new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
            {isCanceled && <span>Your subscription has been canceled.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Usage meters */}
          <UsageMeter
            icon={<Database className="size-4 shrink-0" strokeWidth={1.5} />}
            label="Donors"
            current={usage.donors}
            max={limits.maxDonors}
          />
          <UsageMeter
            icon={<Sparkles className="size-4 shrink-0" strokeWidth={1.5} />}
            label="AI insights this month"
            current={usage.aiInsights}
            max={limits.maxAiInsightsPerMonth}
          />
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                alert.type === "critical"
                  ? "border-destructive/30 bg-destructive/5 text-destructive dark:border-destructive/40 dark:bg-destructive/10"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-400"
              }`}
            >
              {alert.type === "critical" ? (
                <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              )}
              <div className="flex-1">
                <span>{alert.message}</span>
                {sub.planId !== "pro" && (
                  <button
                    onClick={() => {
                      const el = document.getElementById("plan-comparison")
                      el?.scrollIntoView({ behavior: "smooth" })
                    }}
                    className="ml-1 font-medium underline underline-offset-2 hover:no-underline"
                  >
                    View plans
                  </button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
        {hasStripeCustomer && (
          <CardFooter>
            <Button
              variant="outline"
              onClick={handlePortal}
              disabled={actionLoading === "portal"}
              className="gap-2"
            >
              {actionLoading === "portal" ? (
                <Spinner className="size-4" />
              ) : (
                <ExternalLink className="size-4" strokeWidth={1.5} />
              )}
              Manage payment & invoices
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Plan comparison */}
      <div id="plan-comparison">
        <h4 className="text-base font-medium mb-4">
          {isTrialing || isCanceled ? "Choose a plan" : "Change plan"}
        </h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(["essentials", "growth", "pro"] as const).map((planKey) => {
            const plan = PLANS[planKey]
            const planIdx = PLAN_ORDER.indexOf(planKey)
            const isCurrent = sub.planId === planKey && !isCanceled
            const isDowngrade = planIdx < currentPlanIdx && !isCanceled && !isTrialing

            return (
              <Card
                key={planKey}
                className={`flex flex-col ${
                  planKey === "growth"
                    ? "border-emerald-500/50 dark:border-emerald-400/30"
                    : ""
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {planKey === "growth" && (
                      <Badge variant="secondary" className="text-xs">
                        Popular
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">${plan.monthlyPrice}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={1.5} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button className="w-full" disabled variant="outline">
                      Current plan
                    </Button>
                  ) : isDowngrade ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={handlePortal}
                      disabled={!!actionLoading}
                    >
                      Manage in portal
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleCheckout(planKey)}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === planKey ? (
                        <Spinner className="size-4" />
                      ) : (
                        <>
                          <CreditCard className="mr-2 size-4" strokeWidth={1.5} />
                          {isTrialing || isCanceled ? "Subscribe" : "Upgrade"}
                        </>
                      )}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Usage meter sub-component
// ---------------------------------------------------------------------------

function UsageMeter({
  icon,
  label,
  current,
  max,
}: {
  icon: React.ReactNode
  label: string
  current: number
  max: number
}) {
  const isUnlimited = max === 0
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100))
  const isNearLimit = percentage >= 80
  const isAtLimit = percentage >= 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={isAtLimit ? "font-medium text-destructive" : ""}>
          {current.toLocaleString()}
          {isUnlimited ? "" : ` / ${max.toLocaleString()}`}
          {isUnlimited && (
            <span className="ml-1 text-xs text-muted-foreground">(unlimited)</span>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={`h-1.5 ${
            isAtLimit
              ? "[&>div]:bg-destructive"
              : isNearLimit
                ? "[&>div]:bg-amber-500"
                : ""
          }`}
        />
      )}
    </div>
  )
}
