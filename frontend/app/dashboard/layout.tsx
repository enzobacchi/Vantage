import { redirect } from "next/navigation"
import { getCurrentUserOrg } from "@/lib/auth"
import { hasAcceptedTerms } from "@/app/actions/legal"
import { hasCompletedOnboarding } from "@/app/actions/onboarding"
import { getOrgSubscription, resolveTrialLimits } from "@/lib/subscription"
import DashboardShell from "./dashboard-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userOrg = await getCurrentUserOrg()
  if (!userOrg) {
    redirect("/login?next=/dashboard")
  }
  const [tosAccepted, onboardingDone, subscription] = await Promise.all([
    hasAcceptedTerms(),
    hasCompletedOnboarding(),
    getOrgSubscription(userOrg.orgId),
  ])
  const limits = resolveTrialLimits(subscription.planId, subscription.trialTier)
  const planSummary = {
    planName: limits.name,
    maxDonors: limits.maxDonors,
    maxAiInsightsPerMonth: limits.maxAiInsightsPerMonth,
    maxChatMessagesPerMonth: limits.maxChatMessagesPerMonth,
    isTrial: subscription.planId === "trial",
  }
  return (
    <DashboardShell
      tosAccepted={tosAccepted}
      onboardingDone={onboardingDone}
      planSummary={planSummary}
    >
      {children}
    </DashboardShell>
  )
}
