import { NextResponse } from "next/server"
import Stripe from "stripe"
import { requireUserOrg } from "@/lib/auth"
import { getStripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session for managing subscription,
 * payment methods, and invoices.
 */
export async function POST() {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", auth.orgId)
    .single()

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/settings?tab=billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e) {
    // The stored customer id can point at a customer that doesn't exist in the
    // active Stripe account — e.g. accounts provisioned by manual invoice
    // rather than in-app checkout, or after a Stripe account/key change. The
    // self-serve portal has nothing to manage in that case, so guide the user
    // to support instead of surfacing a raw Stripe error.
    const isMissingCustomer =
      e instanceof Stripe.errors.StripeInvalidRequestError &&
      e.code === "resource_missing"

    if (isMissingCustomer) {
      console.error(
        `[stripe/portal] customer ${org.stripe_customer_id} not found for org ${auth.orgId} (likely manually-provisioned or account changed)`
      )
      return NextResponse.json(
        {
          error:
            "Your plan is managed directly by our team. Email support@vantagedonorai.com to update your billing or subscription.",
        },
        { status: 409 }
      )
    }

    console.error("[stripe/portal] failed to create portal session:", e)
    return NextResponse.json(
      { error: "We couldn't open the billing portal. Please try again or contact support@vantagedonorai.com." },
      { status: 502 }
    )
  }
}
