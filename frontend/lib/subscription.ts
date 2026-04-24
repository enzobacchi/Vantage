import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database"

/** Free trial length for new signups (QR-code lead flow, email signup, etc). */
export const TRIAL_DURATION_DAYS = 30

// ---------------------------------------------------------------------------
// Plan definitions — tiers designed for small-to-midsize nonprofits
// ---------------------------------------------------------------------------

export type PlanLimits = {
  maxDonors: number // 0 = unlimited
  maxAiInsightsPerMonth: number // 0 = unlimited
  monthlyPrice: number // USD, 0 = free
  features: string[]
}

/** Features included in every plan — no tier-gating. */
const SHARED_FEATURES = [
  "Unlimited team members",
  "QuickBooks sync",
  "CSV import/export",
  "Email receipts & year-end batch receipts",
  "Donor map view",
  "Fundraising pipeline",
  "Interaction tracking",
  "AI donor insights",
  "AI chat assistant",
]

export const PLANS: Record<SubscriptionPlan, { name: string; description: string } & PlanLimits> = {
  trial: {
    name: "Free Trial",
    description: `${TRIAL_DURATION_DAYS}-day trial with full access`,
    maxDonors: 500,
    maxAiInsightsPerMonth: 30,
    monthlyPrice: 0,
    features: ["Up to 500 donors", "30 AI insights per month", ...SHARED_FEATURES],
  },
  essentials: {
    name: "Starter",
    description: "For small nonprofits & ministries",
    maxDonors: 500,
    maxAiInsightsPerMonth: 30,
    monthlyPrice: 29,
    features: ["Up to 500 donors", "30 AI insights per month", ...SHARED_FEATURES],
  },
  growth: {
    name: "Growth",
    description: "For growing organizations",
    maxDonors: 2_500,
    maxAiInsightsPerMonth: 100,
    monthlyPrice: 59,
    features: ["Up to 2,500 donors", "100 AI insights per month", ...SHARED_FEATURES],
  },
  pro: {
    name: "Pro",
    description: "For large ministries & nonprofits",
    maxDonors: 10_000,
    maxAiInsightsPerMonth: 0,
    monthlyPrice: 99,
    features: ["Up to 10,000 donors", "Unlimited AI insights", ...SHARED_FEATURES],
  },
  enterprise: {
    name: "Enterprise",
    description: "For large-scale organizations",
    maxDonors: 0,
    maxAiInsightsPerMonth: 0,
    monthlyPrice: 0,
    features: ["Unlimited donors", "Unlimited AI insights", ...SHARED_FEATURES],
  },
}

// Stripe Price IDs — set these in env vars once created in Stripe dashboard.
// Format: STRIPE_PRICE_<PLAN>_MONTHLY
export function getStripePriceId(plan: Exclude<SubscriptionPlan, "trial" | "enterprise">): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`
  const priceId = process.env[envKey]
  if (!priceId) {
    throw new Error(`Missing ${envKey} env var. Create the price in Stripe and set it.`)
  }
  return priceId
}

// ---------------------------------------------------------------------------
// Subscription status helpers
// ---------------------------------------------------------------------------

/** Statuses that grant access to the app. */
const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active"]

/** Check if a subscription status allows app access. */
export function isActiveSubscription(status: SubscriptionStatus | null | undefined): boolean {
  if (!status) return false
  return ACTIVE_STATUSES.includes(status)
}

/** Check if a trial has expired. */
export function isTrialExpired(trialEndsAt: string | null | undefined): boolean {
  if (!trialEndsAt) return false
  return new Date(trialEndsAt) < new Date()
}

// ---------------------------------------------------------------------------
// Org subscription loader (for server-side checks)
// ---------------------------------------------------------------------------

export type OrgSubscription = {
  planId: SubscriptionPlan
  status: SubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/**
 * Get the current subscription for an org.
 * If no subscription exists, creates a default trial.
 */
export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()

  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_id, status, trial_ends_at, current_period_end, cancel_at_period_end")
    .eq("org_id", orgId)
    .single()

  if (sub) {
    return {
      planId: sub.plan_id as SubscriptionPlan,
      status: sub.status as SubscriptionStatus,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }
  }

  // No subscription — create a default trial
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS)

  await admin
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        plan_id: "trial",
        status: "trialing",
        trial_ends_at: trialEnd.toISOString(),
      },
      { onConflict: "org_id" }
    )

  return {
    planId: "trial",
    status: "trialing",
    trialEndsAt: trialEnd.toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  }
}

/**
 * Check if an org has exceeded a plan limit.
 * Returns true if the limit is exceeded (action should be blocked).
 */
export async function isLimitExceeded(
  orgId: string,
  metric: "donors" | "ai_insights"
): Promise<boolean> {
  const sub = await getOrgSubscription(orgId)
  const plan = PLANS[sub.planId]

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()

  switch (metric) {
    case "donors": {
      if (plan.maxDonors === 0) return false
      const { count } = await admin
        .from("donors")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
      return (count ?? 0) >= plan.maxDonors
    }
    case "ai_insights": {
      if (plan.maxAiInsightsPerMonth === 0) return false
      // Check usage for the current month
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { data: usage } = await admin
        .from("subscription_usage")
        .select("count")
        .eq("org_id", orgId)
        .eq("metric", "ai_insights")
        .gte("period_start", periodStart)
        .single()
      return (usage?.count ?? 0) >= plan.maxAiInsightsPerMonth
    }
    default:
      return false
  }
}

/**
 * Increment a usage counter for the current billing period.
 */
export async function incrementUsage(orgId: string, metric: "ai_insights" | "email_sends"): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Upsert: increment if exists, insert with count=1 if new
  const { data: existing } = await admin
    .from("subscription_usage")
    .select("id, count")
    .eq("org_id", orgId)
    .eq("metric", metric)
    .gte("period_start", periodStart.toISOString())
    .single()

  if (existing) {
    await admin
      .from("subscription_usage")
      .update({ count: existing.count + 1, updated_at: now.toISOString() })
      .eq("id", existing.id)
  } else {
    await admin.from("subscription_usage").insert({
      org_id: orgId,
      metric,
      count: 1,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    })
  }
}
