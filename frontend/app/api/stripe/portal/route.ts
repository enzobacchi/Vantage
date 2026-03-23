import { NextResponse } from "next/server"
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

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url })
}
