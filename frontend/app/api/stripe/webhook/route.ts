import { NextRequest, NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifySystemAlert } from "@/lib/notifications"
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database"
import Stripe from "stripe"

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 * Must be excluded from body parsing — needs raw body for signature verification.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {
    // Checkout completed — create or update subscription record.
    // For in-app checkout, org_id is in metadata. For Payment Link purchases
    // (website), org_id is missing — the link-stripe-checkout endpoint handles
    // those when the user creates their account, so we skip gracefully.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.metadata?.org_id
      const planId = session.metadata?.plan_id as SubscriptionPlan | undefined
      const stripeSubId = typeof session.subscription === "string" ? session.subscription : null

      // No org_id means this is a Payment Link purchase — skip, the signup
      // flow will handle linking via /api/auth/link-stripe-checkout
      if (!orgId || !planId || !stripeSubId) break

      // Expand items to get period dates (Stripe API 2026-02-25)
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
        expand: ["items"],
      })
      const { periodStart, periodEnd } = getSubPeriodDates(stripeSub)

      await admin
        .from("subscriptions")
        .upsert(
          {
            org_id: orgId,
            stripe_subscription_id: stripeSubId,
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
      break
    }

    // Subscription updated (renewal, plan change, cancellation).
    // If org_id is missing in metadata, try to find the org by stripe_subscription_id
    // as a fallback (covers edge cases where metadata wasn't stamped yet).
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      let orgId = sub.metadata?.org_id
      const planId = sub.metadata?.plan_id as SubscriptionPlan | undefined

      // Fallback: look up org by stripe_subscription_id
      if (!orgId) {
        const { data: existing } = await admin
          .from("subscriptions")
          .select("org_id")
          .eq("stripe_subscription_id", sub.id)
          .single()
        orgId = existing?.org_id
      }
      if (!orgId) break

      const { periodStart, periodEnd } = getSubPeriodDates(sub)

      await admin
        .from("subscriptions")
        .update({
          ...(planId && { plan_id: planId }),
          status: mapStripeStatus(sub.status),
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: sub.cancel_at_period_end,
          trial_ends_at: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
      break
    }

    // Subscription canceled/deleted
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      let orgId = sub.metadata?.org_id

      // Fallback: look up org by stripe_subscription_id
      if (!orgId) {
        const { data: existing } = await admin
          .from("subscriptions")
          .select("org_id")
          .eq("stripe_subscription_id", sub.id)
          .single()
        orgId = existing?.org_id
      }
      if (!orgId) break

      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
      break
    }

    // Invoice payment failed
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      // In Stripe v20+, subscription is under parent.subscription_details
      const subDetails = invoice.parent?.subscription_details
      const subId =
        typeof subDetails?.subscription === "string"
          ? subDetails.subscription
          : typeof subDetails?.subscription === "object"
            ? subDetails.subscription?.id
            : null
      if (!subId) break

      const { data: subRow } = await admin
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subId)
        .select("org_id")
        .single()

      if (subRow?.org_id) {
        void notifySystemAlert(subRow.org_id, "Payment failed", "Your latest payment failed. Please update your payment method in billing settings to avoid service interruption.").catch(console.error)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract period dates from a Stripe subscription.
 * In API version 2026-02-25, current_period_start/end live on subscription
 * items rather than the subscription object itself.
 */
function getSubPeriodDates(sub: Stripe.Subscription): {
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
  // Fallback: use start_date if items aren't expanded
  return {
    periodStart: new Date(sub.start_date * 1000).toISOString(),
    periodEnd: null,
  }
}

/** Map Stripe subscription status to our status enum. */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
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
