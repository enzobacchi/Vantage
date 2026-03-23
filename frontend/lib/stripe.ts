import Stripe from "stripe"

function getStripeEnv() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY env var.")
  }
  return secretKey
}

let _stripe: Stripe | null = null

/** Server-side Stripe client (singleton). */
export function getStripe(): Stripe {
  if (typeof window !== "undefined") {
    throw new Error("getStripe must only be used on the server.")
  }
  if (!_stripe) {
    _stripe = new Stripe(getStripeEnv(), { apiVersion: "2026-02-25.clover" })
  }
  return _stripe
}

/**
 * Get or create a Stripe customer for an organization.
 * Links the Stripe customer ID back to the org row.
 */
export async function getOrCreateStripeCustomer(
  orgId: string,
  orgName: string,
  email: string
): Promise<string> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient()
  const stripe = getStripe()

  // Check if org already has a Stripe customer
  const { data: org } = await admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single()

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    name: orgName,
    email,
    metadata: { org_id: orgId },
  })

  // Store customer ID on org
  await admin
    .from("organizations")
    .update({ stripe_customer_id: customer.id })
    .eq("id", orgId)

  return customer.id
}
