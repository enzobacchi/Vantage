"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Lock,
  Sparkles,
} from "lucide-react"
import { completeOnboarding } from "@/app/actions/onboarding"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useChatOverlay } from "@/components/chat/chat-provider"
import { toast } from "sonner"

type PlanSummary = {
  planName: string
  maxDonors: number
  maxAiInsightsPerMonth: number
  maxChatMessagesPerMonth: number
  isTrial: boolean
}

function formatLimit(n: number, suffix: string): string {
  if (n === 0) return `Unlimited ${suffix}`
  return `${n.toLocaleString()} ${suffix}`
}

const SEED_PROMPTS = [
  "Who are my top 10 donors this year?",
  "Show me donors who haven't given in 12 months",
  "Which donors gave over $1,000 last year?",
  "Draft a thank-you email for my biggest donor this month",
]

export function OnboardingWizard({
  open,
  planSummary,
}: {
  open: boolean
  planSummary?: PlanSummary
}) {
  const router = useRouter()
  const { openWithMessage } = useChatOverlay()
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)

  const steps = useMemo(() => buildSteps(planSummary), [planSummary])
  const isLast = step === steps.length - 1
  const current = steps[step]
  const Icon = current.icon

  async function handleFinish(redirectTo?: string) {
    setCompleting(true)
    try {
      const result = await completeOnboarding()
      if (!result.success) {
        toast.error(result.error ?? "Could not save onboarding state")
      }
      router.refresh()
      if (redirectTo) {
        router.push(redirectTo)
      }
    } finally {
      setCompleting(false)
    }
  }

  async function handleSeedPrompt(prompt: string) {
    setCompleting(true)
    try {
      await completeOnboarding()
      router.refresh()
      openWithMessage(prompt)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-lg [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#007A3F] to-[#21E0D6]">
              <Icon className="size-5 text-white" strokeWidth={1.5} />
            </div>
            <DialogTitle>{current.title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="py-2">
          {current.render({ planSummary, onSeedPrompt: handleSeedPrompt })}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={
                i === step
                  ? "size-2 rounded-full bg-foreground"
                  : "size-1.5 rounded-full bg-muted-foreground/30"
              }
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFinish()}
            disabled={completing}
            className="text-muted-foreground"
          >
            Skip setup
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
                disabled={completing}
              >
                Back
              </Button>
            )}
            {current.action && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFinish(current.action!.href)}
                disabled={completing}
              >
                {current.action.label}
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={() => handleFinish()}
                disabled={completing}
                className="bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0"
              >
                {completing ? "Saving..." : "Get started"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                className="gap-1.5"
              >
                Next
                <ArrowRight className="size-3.5" strokeWidth={1.5} />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type OnboardingStep = {
  id: string
  title: string
  icon: typeof CheckCircle2
  render: (ctx: {
    planSummary?: PlanSummary
    onSeedPrompt: (prompt: string) => void
  }) => React.ReactNode
  action?: { label: string; href: string }
}

function buildSteps(planSummary?: PlanSummary): OnboardingStep[] {
  return [
    {
      id: "welcome",
      title: "Welcome to Vantage",
      icon: CheckCircle2,
      render: ({ planSummary }) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vantage is your AI-powered donor CRM. Manage donors, track giving, and
            sync directly with your accounting software.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lock className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
              Your data stays yours
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              AI only sees redacted data. Names, emails, phones, and addresses are
              replaced with placeholders before any AI call. We've contractually
              prohibited our AI providers from training on your data.
            </p>
          </div>

          {planSummary && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">
                You're on the {planSummary.planName}
                {planSummary.isTrial ? " — 30-day trial" : ""}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>• {formatLimit(planSummary.maxDonors, "donors")}</li>
                <li>
                  • {formatLimit(planSummary.maxAiInsightsPerMonth, "AI insights / month")}
                </li>
                <li>
                  • {formatLimit(planSummary.maxChatMessagesPerMonth, "AI chats / month")}
                </li>
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "import",
      title: "Import your donors",
      icon: FileSpreadsheet,
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Bring your existing donors into Vantage in seconds:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
              <span>
                <strong className="text-foreground">CSV Import</strong> — upload a
                spreadsheet from any existing system.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
              <span>
                <strong className="text-foreground">QuickBooks Sync</strong> —
                connect your QuickBooks account to automatically import customers
                and donations.
              </span>
            </li>
          </ul>
        </div>
      ),
      action: { label: "Import Donors", href: "/settings?tab=integrations" },
    },
    {
      id: "connect",
      title: "Connect QuickBooks",
      icon: Link2,
      render: () => (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you use QuickBooks Online, connecting it takes about 30 seconds.
            Vantage will sync your customers as donors and pull in donation
            history — and keep it updated every night.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Don&apos;t use QuickBooks? No problem — CSV import works great for
            data from any system.
          </p>
        </div>
      ),
      action: { label: "Connect QuickBooks", href: "/settings?tab=integrations" },
    },
    {
      id: "explore",
      title: "Try the AI",
      icon: Sparkles,
      render: ({ onSeedPrompt }) => (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Once your donors are in, ask Vantage AI anything about them. Cmd+J
            opens the chat from anywhere. Here are a few to try:
          </p>
          <div className="flex flex-col gap-2">
            {SEED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSeedPrompt(prompt)}
                className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-border hover:bg-accent"
              >
                {prompt}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            You can also log calls, meetings, and tasks on any donor page to
            keep a full activity timeline.
          </p>
        </div>
      ),
    },
  ]
}
