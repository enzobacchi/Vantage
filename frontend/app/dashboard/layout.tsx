import { redirect } from "next/navigation"
import { getCurrentUserOrg } from "@/lib/auth"
import { hasAcceptedTerms } from "@/app/actions/legal"
import { hasCompletedOnboarding } from "@/app/actions/onboarding"
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
  const [tosAccepted, onboardingDone] = await Promise.all([
    hasAcceptedTerms(),
    hasCompletedOnboarding(),
  ])
  return (
    <DashboardShell tosAccepted={tosAccepted} onboardingDone={onboardingDone}>
      {children}
    </DashboardShell>
  )
}
