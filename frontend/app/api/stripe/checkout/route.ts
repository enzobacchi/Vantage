import { NextRequest, NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { getStripe, getOrCreateStripeCustomer } from "@/lib/stripe"
import { getStripePriceId } from "@/lib/subscription"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SubscriptionPlan } from "@/types/database"

const VALID_PLANS: SubscriptionPlan[] = ["essentials", "growth", "pro"]

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for a subscription plan upgrade.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const body = (await req.json()) as { plan?: string }
  const plan = body.plan as SubscriptionPlan | undefined

  if (!plan || !VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { error: "Invalid plan. Must be one of: essentials, growth, pro" },
      { status: 400 }
    )
  }

  try {
    const admin = createAdminClient()

    // Get org name and user email for Stripe customer
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", auth.orgId)
      .single()

    const { data: userData } = await admin.auth.admin.getUserById(auth.userId)
    const email = userData?.user?.email ?? ""

    const customerId = await getOrCreateStripeCustomer(
      auth.orgId,
      org?.name ?? "Organization",
      email
    )

    const stripe = getStripe()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const priceId = getStripePriceId(plan as Exclude<SubscriptionPlan, "trial" | "enterprise">)

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings?tab=billing`,
      subscription_data: {
        metadata: { org_id: auth.orgId, plan_id: plan },
      },
      metadata: { org_id: auth.orgId, plan_id: plan },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("[stripe/checkout] Error creating checkout session:", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
