import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database"
import type Stripe from "stripe"

/**
 * POST /api/auth/link-stripe-checkout
 *
 * Called after a user signs up via a Payment Link on the marketing website.
 * Retrieves the Stripe checkout session, links the subscription + customer
 * to the user's org, and stamps org_id onto Stripe metadata so future
 * webhook events route correctly.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser()

  if (sessionError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as { checkout_session_id?: string }
  const sessionId = body.checkout_session_id
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json(
      { error: "Missing checkout_session_id" },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const admin = createAdminClient()

  // 1. Retrieve the checkout session from Stripe
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items", "customer"],
    })
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired checkout session" },
      { status: 400 }
    )
  }

  if (session.payment_status !== "paid" && session.status !== "complete") {
    return NextResponse.json(
      { error: "Checkout session is not completed" },
      { status: 400 }
    )
  }

  // Extract expanded objects, ensuring customer is not a deleted customer
  const stripeCustomer =
    typeof session.customer === "object" &&
    session.customer !== null &&
    !("deleted" in session.customer && session.customer.deleted)
      ? (session.customer as Stripe.Customer)
      : null
  const stripeSub =
    typeof session.subscription === "object" && session.subscription !== null
      ? (session.subscription as Stripe.Subscription)
      : null

  if (!stripeCustomer || !stripeSub) {
    return NextResponse.json(
      { error: "Could not retrieve Stripe customer or subscription" },
      { status: 400 }
    )
  }

  // 2. Get the user's org (getCurrentUserOrg auto-creates one on first login)
  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let orgId: string

  if (membership?.organization_id) {
    orgId = membership.organization_id
  } else {
    // No org yet — create one using the org name from the Stripe custom field
    // or fall back to the customer name from Stripe
    const orgName =
      getCustomFieldValue(session, "organization_name") ??
      stripeCustomer.name ??
      "My Organization"

    const { data: newOrg, error: orgError } = await admin
      .from("organizations")
      .insert({ name: orgName })
      .select("id")
      .single()

    if (orgError || !newOrg?.id) {
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      )
    }

    orgId = newOrg.id

    await admin.from("organization_members").upsert(
      { user_id: user.id, organization_id: orgId, role: "owner" },
      { onConflict: "user_id,organization_id" }
    )
  }

  // 3. Update the org name from the custom field if it's still the default
  const orgNameFromStripe =
    getCustomFieldValue(session, "organization_name") ?? stripeCustomer.name

  if (orgNameFromStripe) {
    const { data: currentOrg } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single()

    if (currentOrg?.name === "My Organization") {
      await admin
        .from("organizations")
        .update({ name: orgNameFromStripe })
        .eq("id", orgId)
    }
  }

  // 4. Link Stripe customer ID to the org
  await admin
    .from("organizations")
    .update({ stripe_customer_id: stripeCustomer.id })
    .eq("id", orgId)

  // 5. Determine the plan from session metadata or Stripe price
  const planId = resolvePlanId(session, stripeSub)

  // 6. Get period dates from the first subscription item
  //    (In Stripe API 2026-02-25, period dates are on items, not the subscription)
  const firstItem = stripeSub.items?.data?.[0]
  const periodStart = firstItem
    ? new Date(firstItem.current_period_start * 1000).toISOString()
    : new Date(stripeSub.start_date * 1000).toISOString()
  const periodEnd = firstItem
    ? new Date(firstItem.current_period_end * 1000).toISOString()
    : null

  // 7. Upsert the subscription record
  await admin.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: stripeSub.id,
      plan_id: planId,
      status: mapStripeStatus(stripeSub.status),
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: stripeSub.cancel_at_period_end,
      trial_ends_at: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  )

  // 8. Stamp org_id onto the Stripe subscription metadata so future
  //    webhook events (renewals, cancellations, payment failures) route correctly
  await stripe.subscriptions.update(stripeSub.id, {
    metadata: {
      ...stripeSub.metadata,
      org_id: orgId,
      plan_id: planId,
    },
  })

  // Also update the Stripe customer metadata
  await stripe.customers.update(stripeCustomer.id, {
    metadata: {
      ...stripeCustomer.metadata,
      org_id: orgId,
    },
  })

  return NextResponse.json({
    linked: true,
    orgId,
    planId,
    status: stripeSub.status,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a custom field value from the checkout session by key. */
function getCustomFieldValue(
  session: Stripe.Checkout.Session,
  key: string
): string | null {
  if (!session.custom_fields) return null
  const field = session.custom_fields.find((f) => f.key === key)
  return field?.text?.value ?? null
}

/** Resolve the plan ID from checkout metadata or Stripe price. */
function resolvePlanId(
  session: Stripe.Checkout.Session,
  sub: Stripe.Subscription
): SubscriptionPlan {
  // Check session metadata first (set by in-app checkout)
  const fromSession = session.metadata?.plan_id
  if (fromSession && isValidPlan(fromSession)) return fromSession

  // Check subscription metadata
  const fromSub = sub.metadata?.plan_id
  if (fromSub && isValidPlan(fromSub)) return fromSub

  // Fall back to matching the Stripe price ID to our env vars
  const priceId = sub.items?.data?.[0]?.price?.id
  if (priceId) {
    if (priceId === process.env.STRIPE_PRICE_ESSENTIALS_MONTHLY) return "essentials"
    if (priceId === process.env.STRIPE_PRICE_GROWTH_MONTHLY) return "growth"
    if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "pro"
    // Check annual price IDs too
    if (priceId === process.env.STRIPE_PRICE_ESSENTIALS_ANNUAL) return "essentials"
    if (priceId === process.env.STRIPE_PRICE_GROWTH_ANNUAL) return "growth"
    if (priceId === process.env.STRIPE_PRICE_PRO_ANNUAL) return "pro"
  }

  // Default to essentials if we can't determine
  return "essentials"
}

const VALID_PLANS: SubscriptionPlan[] = ["trial", "essentials", "growth", "pro"]
function isValidPlan(plan: string): plan is SubscriptionPlan {
  return VALID_PLANS.includes(plan as SubscriptionPlan)
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing": return "trialing"
    case "active": return "active"
    case "past_due": return "past_due"
    case "canceled": return "canceled"
    case "unpaid": return "unpaid"
    default: return "canceled"
  }
}
