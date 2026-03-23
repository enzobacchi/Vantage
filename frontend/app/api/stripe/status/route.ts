import { NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { getOrgSubscription, PLANS } from "@/lib/subscription"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/stripe/status
 * Returns the current org's subscription status and plan details.
 */
export async function GET() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const sub = await getOrgSubscription(auth.orgId)
  const plan = PLANS[sub.planId]

  // Get current usage counts
  const admin = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [donorCount, aiUsage] = await Promise.all([
    admin
      .from("donors")
      .select("id", { count: "exact", head: true })
      .eq("org_id", auth.orgId)
      .then((r) => r.count ?? 0),
    admin
      .from("subscription_usage")
      .select("count")
      .eq("org_id", auth.orgId)
      .eq("metric", "ai_insights")
      .gte("period_start", periodStart)
      .single()
      .then((r) => r.data?.count ?? 0),
  ])

  // Check if org has a Stripe customer (can access portal)
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", auth.orgId)
    .single()

  return NextResponse.json({
    subscription: {
      planId: sub.planId,
      planName: plan.name,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    },
    limits: {
      maxDonors: plan.maxDonors,
      maxAiInsightsPerMonth: plan.maxAiInsightsPerMonth,
    },
    usage: {
      donors: donorCount,
      aiInsights: aiUsage,
    },
    plan: {
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      features: plan.features,
    },
    hasStripeCustomer: !!org?.stripe_customer_id,
  })
}
