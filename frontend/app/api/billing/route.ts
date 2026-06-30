import { NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { getOrgSubscription, resolveTrialLimits } from "@/lib/subscription"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/billing
 *
 * Compact billing summary consumed by the mobile app
 * (Mobile/app/settings/billing.tsx). The web settings page uses the richer
 * GET /api/stripe/status; this endpoint exists so the mobile contract is
 * stable and cheap. Keep the shape in sync with Mobile's `Billing` type.
 */
export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const sub = await getOrgSubscription(auth.orgId)
  const plan = resolveTrialLimits(sub.planId, sub.trialTier)

  const admin = createAdminClient()
  const { count } = await admin
    .from("donors")
    .select("id", { count: "exact", head: true })
    .eq("org_id", auth.orgId)

  return NextResponse.json({
    plan: plan.name,
    status: sub.status,
    current_period_end: sub.currentPeriodEnd ?? sub.trialEndsAt,
    donors_used: count ?? 0,
    donors_limit: plan.maxDonors === 0 ? null : plan.maxDonors,
  })
}
