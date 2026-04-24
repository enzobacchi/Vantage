import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database"

/** Free trial length for new signups (QR-code lead flow, email signup, etc). */
export const TRIAL_DURATION_DAYS = 30

// ---------------------------------------------------------------------------
// Plan definitions — tiers designed for small-to-midsize nonprofits
// ---------------------------------------------------------------------------

export type PlanLimits = {
  maxDonors: number // 0 = unlimited
  maxAiInsightsPerMonth: number // 0 = unlimited
  maxChatMessagesPerMonth: number // 0 = unlimited
  monthlyPrice: number // USD, 0 = free
  features: string[]
}

/**
 * Absolute ceiling on donors per org regardless of plan. Pro's nominal cap is
 * 10k; anything larger routes to Enterprise (contact sales) so we don't crash
 * the sync route at the Vercel 60s function limit.
 */
export const ABSOLUTE_DONOR_CEILING = 10_000

/** Valid trial tiers picked at signup (plan_id stays "trial"). */
export type TrialTier = "essentials" | "growth" | "pro"

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
    maxChatMessagesPerMonth: 200,
    monthlyPrice: 0,
    features: ["Up to 500 donors", "30 AI insights per month", "200 AI chats per month", ...SHARED_FEATURES],
  },
  essentials: {
    name: "Starter",
    description: "For small nonprofits & ministries",
    maxDonors: 500,
    maxAiInsightsPerMonth: 30,
    maxChatMessagesPerMonth: 200,
    monthlyPrice: 29,
    features: ["Up to 500 donors", "30 AI insights per month", "200 AI chats per month", ...SHARED_FEATURES],
  },
  growth: {
    name: "Growth",
    description: "For growing organizations",
    maxDonors: 2_500,
    maxAiInsightsPerMonth: 100,
    maxChatMessagesPerMonth: 1_000,
    monthlyPrice: 59,
    features: ["Up to 2,500 donors", "100 AI insights per month", "1,000 AI chats per month", ...SHARED_FEATURES],
  },
  pro: {
    name: "Pro",
    description: "For large ministries & nonprofits",
    maxDonors: 10_000,
    maxAiInsightsPerMonth: 0,
    maxChatMessagesPerMonth: 0,
    monthlyPrice: 99,
    features: ["Up to 10,000 donors", "Unlimited AI insights", "Unlimited AI chats", ...SHARED_FEATURES],
  },
  enterprise: {
    name: "Enterprise",
    description: "For large-scale organizations",
    maxDonors: 0,
    maxAiInsightsPerMonth: 0,
    maxChatMessagesPerMonth: 0,
    monthlyPrice: 0,
    features: ["Unlimited donors", "Unlimited AI insights", "Unlimited AI chats", ...SHARED_FEATURES],
  },
}

/**
 * Resolve the effective plan limits for an org. When `plan_id === "trial"`,
 * the trial_tier picked at signup determines the donor/AI caps (an Essentials-tier
 * trial is capped at 500; a Pro-tier trial at 10,000). Falls back to the base
 * "trial" plan (500) if no tier was picked — legacy rows.
 *
 * Callers must use this instead of reading PLANS[planId] directly.
 */
export function resolveTrialLimits(
  planId: SubscriptionPlan,
  trialTier: TrialTier | null | undefined
): { name: string; description: string } & PlanLimits {
  if (planId === "trial" && trialTier && PLANS[trialTier]) {
    const tier = PLANS[trialTier]
    return {
      ...tier,
      name: `${tier.name} Trial`,
      description: `${TRIAL_DURATION_DAYS}-day trial with ${tier.name} limits`,
      monthlyPrice: 0,
    }
  }
  return PLANS[planId]
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
  trialTier: TrialTier | null
  status: SubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/** Short-lived cookie that carries the trial tier picked at signup. */
export const PENDING_TRIAL_TIER_COOKIE = "pending_trial_tier"

async function readPendingTrialTier(): Promise<TrialTier | null> {
  try {
    const { cookies } = await import("next/headers")
    const jar = await cookies()
    const raw = jar.get(PENDING_TRIAL_TIER_COOKIE)?.value
    if (raw === "essentials" || raw === "growth" || raw === "pro") return raw
    return null
  } catch {
    // cookies() throws outside a request scope (cron, jobs) — safe to ignore.
    return null
  }
}

async function clearPendingTrialTier(): Promise<void> {
  try {
    const { cookies } = await import("next/headers")
    const jar = await cookies()
    jar.delete(PENDING_TRIAL_TIER_COOKIE)
  } catch {
    // no-op outside request scope
  }
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
    .select("plan_id, trial_tier, status, trial_ends_at, current_period_end, cancel_at_period_end")
    .eq("org_id", orgId)
    .single()

  if (sub) {
    return {
      planId: sub.plan_id as SubscriptionPlan,
      trialTier: (sub.trial_tier as TrialTier | null) ?? null,
      status: sub.status as SubscriptionStatus,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }
  }

  // No subscription — create a default trial, honoring the tier cookie if
  // the user picked one during signup.
  const pickedTier = await readPendingTrialTier()
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS)

  await admin
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        plan_id: "trial",
        trial_tier: pickedTier,
        status: "trialing",
        trial_ends_at: trialEnd.toISOString(),
      },
      { onConflict: "org_id" }
    )

  if (pickedTier) await clearPendingTrialTier()

  return {
    planId: "trial",
    trialTier: pickedTier,
    status: "trialing",
    trialEndsAt: trialEnd.toISOString(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  }
}

export type MeteredMetric = "ai_insights" | "email_sends" | "chat_messages"
export type LimitMetric = "donors" | "ai_insights" | "chat_messages"

/**
 * Check if an org has exceeded a plan limit.
 * Returns true if the limit is exceeded (action should be blocked).
 */
export async function isLimitExceeded(
  orgId: string,
  metric: LimitMetric
): Promise<boolean> {
  const sub = await getOrgSubscription(orgId)
  const plan = resolveTrialLimits(sub.planId, sub.trialTier)

  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()

  switch (metric) {
    case "donors": {
      // Hard absolute ceiling: even Pro trials cap at ABSOLUTE_DONOR_CEILING to
      // keep the sync route inside the Vercel 60s function limit. Orgs above
      // this talk to sales (Enterprise).
      const cap = plan.maxDonors === 0 ? ABSOLUTE_DONOR_CEILING : Math.min(plan.maxDonors, ABSOLUTE_DONOR_CEILING)
      const { count } = await admin
        .from("donors")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
      return (count ?? 0) >= cap
    }
    case "ai_insights": {
      if (plan.maxAiInsightsPerMonth === 0) return false
      const used = await readMonthlyUsage(orgId, "ai_insights")
      return used >= plan.maxAiInsightsPerMonth
    }
    case "chat_messages": {
      if (plan.maxChatMessagesPerMonth === 0) return false
      const used = await readMonthlyUsage(orgId, "chat_messages")
      return used >= plan.maxChatMessagesPerMonth
    }
    default:
      return false
  }
}

async function readMonthlyUsage(orgId: string, metric: MeteredMetric): Promise<number> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data: usage } = await admin
    .from("subscription_usage")
    .select("count")
    .eq("org_id", orgId)
    .eq("metric", metric)
    .gte("period_start", periodStart)
    .single()
  return usage?.count ?? 0
}

/**
 * Read current-month usage + the plan cap for UI display. `limit === 0` means
 * unlimited on that plan.
 */
export async function getUsage(
  orgId: string,
  metric: MeteredMetric
): Promise<{ used: number; limit: number; remaining: number; resetsAt: string }> {
  const sub = await getOrgSubscription(orgId)
  const plan = resolveTrialLimits(sub.planId, sub.trialTier)
  const used = await readMonthlyUsage(orgId, metric)
  const limit =
    metric === "ai_insights"
      ? plan.maxAiInsightsPerMonth
      : metric === "chat_messages"
        ? plan.maxChatMessagesPerMonth
        : 0
  const remaining = limit === 0 ? Infinity : Math.max(0, limit - used)
  const now = new Date()
  const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  return { used, limit, remaining: remaining === Infinity ? 0 : remaining, resetsAt }
}

/**
 * Increment a usage counter for the current billing period.
 */
export async function incrementUsage(orgId: string, metric: MeteredMetric): Promise<void> {
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
