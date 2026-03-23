"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Users,
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
import { toast } from "sonner"

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to Vantage",
    icon: CheckCircle2,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Vantage is your AI-powered donor CRM. It helps you manage donor
          relationships, track giving history, and sync directly with your
          accounting software.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Let&apos;s take a quick look at how to get started.
        </p>
      </div>
    ),
  },
  {
    id: "import",
    title: "Import your donors",
    icon: FileSpreadsheet,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          You can bring your existing donors into Vantage in two ways:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>
              <strong className="text-foreground">CSV Import</strong> — upload a
              spreadsheet from any existing system. Head to{" "}
              <strong className="text-foreground">Settings → Integrations</strong>{" "}
              to get started.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>
              <strong className="text-foreground">QuickBooks Sync</strong> —
              connect your QuickBooks account to automatically import customers
              and donations.
            </span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "connect",
    title: "Connect QuickBooks",
    icon: Link2,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you use QuickBooks Online, connecting it takes about 30 seconds.
          Vantage will automatically sync your customers as donors and pull in
          donation history from sales receipts and invoices.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Go to{" "}
          <strong className="text-foreground">Settings → Integrations</strong> and
          click <strong className="text-foreground">Connect QuickBooks</strong>.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Don&apos;t use QuickBooks? No problem — CSV import works great for
          data from any system.
        </p>
      </div>
    ),
  },
  {
    id: "explore",
    title: "Explore your dashboard",
    icon: Users,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Once your donors are in, you can:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>View donor profiles, giving history, and AI-generated insights</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>Filter and sort donors by lifecycle status, tags, or date range</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>Use the AI chat (Cmd+J) to ask questions about your donor base</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 size-1.5 rounded-full bg-foreground/40 shrink-0 mt-2" />
            <span>Log calls, emails, and tasks to keep a full activity timeline</span>
          </li>
        </ul>
      </div>
    ),
  },
]

export function OnboardingWizard({ open }: { open: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]
  const Icon = current.icon

  async function handleFinish() {
    setCompleting(true)
    try {
      const result = await completeOnboarding()
      if (!result.success) {
        toast.error(result.error ?? "Could not save onboarding state")
      }
      router.refresh()
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

        <div className="py-2">{current.content}</div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEPS.map((_, i) => (
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
            onClick={handleFinish}
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
            {isLast ? (
              <Button
                size="sm"
                onClick={handleFinish}
                disabled={completing}
                className="bg-gradient-to-r from-[#007A3F] to-[#21E0D6] text-white hover:opacity-90 border-0"
              >
                {completing ? "Saving…" : "Get started"}
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
