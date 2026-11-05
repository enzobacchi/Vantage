import type Stripe from "stripe"
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database"

/**
 * Turning Stripe subscription state into our `subscriptions` row.
 *
 * Shared by the Stripe webhook (the normal path) and the post-checkout confirm
 * (`POST /api/stripe/confirm`), which is the backstop for when the webhook is
 * slow or not delivering — without it, a customer who paid would stay on the
 * trial and get locked out when it ends.
 */

/** Plans a Stripe event or checkout may write. Anything else is ignored (defense vs forged metadata). */
const SELF_SERVE_PLANS: SubscriptionPlan[] = ["essentials", "growth", "pro"]

export function sanitizePlanId(planId: string | undefined | null): SubscriptionPlan | undefined {
  return SELF_SERVE_PLANS.includes(planId as SubscriptionPlan)
    ? (planId as SubscriptionPlan)
    : undefined
}

/** Map Stripe subscription status to our status enum. */
export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing"
    case "active":
      return "active"
    case "past_due":
      return "past_due"
    case "canceled":
      return "canceled"
    case "unpaid":
      return "unpaid"
    default:
      return "canceled"
  }
}

/**
 * Period dates for a subscription. In Stripe API 2026-02-25 they live on the
 * subscription items, not the subscription itself.
 */
export function getSubPeriodDates(sub: Stripe.Subscription): {
  periodStart: string
  periodEnd: string | null
} {
  const firstItem = sub.items?.data?.[0]
  if (firstItem) {
    return {
      periodStart: new Date(firstItem.current_period_start * 1000).toISOString(),
      periodEnd: new Date(firstItem.current_period_end * 1000).toISOString(),
    }
  }
  return {
    periodStart: new Date(sub.start_date * 1000).toISOString(),
    periodEnd: null,
  }
}

export type SubscriptionRow = {
  org_id: string
  stripe_subscription_id: string
  plan_id: SubscriptionPlan
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_ends_at: string | null
  updated_at: string
}

/** The `subscriptions` row for an org on a given Stripe subscription. */
export function subscriptionRowFromStripe(
  orgId: string,
  planId: SubscriptionPlan,
  sub: Stripe.Subscription
): SubscriptionRow {
  const { periodStart, periodEnd } = getSubPeriodDates(sub)
  return {
    org_id: orgId,
    stripe_subscription_id: sub.id,
    plan_id: planId,
    status: mapStripeStatus(sub.status),
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
}

export type ConfirmCheckoutDeps = {
  /** Stripe checkout session with `subscription` expanded (it includes its items). */
  retrieveSession: (sessionId: string) => Promise<Stripe.Checkout.Session>
  /** The Stripe subscription id currently linked to the org, if any. */
  readLinkedSubscriptionId: (orgId: string) => Promise<string | null>
  upsertSubscription: (row: SubscriptionRow) => Promise<void>
}

export type ConfirmCheckoutResult =
  | { status: "confirmed" | "already_synced"; planId: SubscriptionPlan }
  | { status: "pending" | "not_live" | "forbidden" | "invalid" }

/**
 * Confirm an in-app checkout directly with Stripe and record the paid plan,
 * so the customer is upgraded even if the webhook never arrives.
 *
 * Only writes when the session belongs to `orgId`, is complete, and its
 * subscription is live — and skips the write when the webhook already linked
 * it. Idempotent with the webhook: both write the same row from Stripe's state.
 */
export async function confirmCheckoutSession(
  sessionId: string,
  orgId: string,
  deps: ConfirmCheckoutDeps
): Promise<ConfirmCheckoutResult> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { status: "invalid" }

  let session: Stripe.Checkout.Session
  try {
    session = await deps.retrieveSession(sessionId)
  } catch (err) {
    console.error(
      "[stripe-subscription-sync] checkout session lookup failed:",
      err instanceof Error ? err.message : err
    )
    return { status: "invalid" }
  }

  // In-app checkout stamps org_id (see /api/stripe/checkout). A session from
  // another org — or a website Payment Link with no org — is not ours to claim.
  if (session.metadata?.org_id !== orgId) return { status: "forbidden" }

  const planId = sanitizePlanId(session.metadata?.plan_id)
  if (!planId) return { status: "invalid" }

  if (session.status !== "complete") return { status: "pending" }

  const sub =
    typeof session.subscription === "object" && session.subscription !== null
      ? session.subscription
      : null
  if (!sub) return { status: "pending" }

  const linkedSubId = await deps.readLinkedSubscriptionId(orgId)
  if (linkedSubId === sub.id) return { status: "already_synced", planId }

  // An old success link for a subscription that has since ended must not
  // overwrite the org's current state.
  if (sub.status !== "active" && sub.status !== "trialing") return { status: "not_live" }

  await deps.upsertSubscription(subscriptionRowFromStripe(orgId, planId, sub))
  return { status: "confirmed", planId }
}
