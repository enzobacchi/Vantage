import { NextRequest, NextResponse } from "next/server"
import { requireUserOrg } from "@/lib/auth"
import { readJsonObject } from "@/lib/http"
import { getStripe } from "@/lib/stripe"
import { confirmCheckoutSession } from "@/lib/stripe-subscription-sync"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/stripe/confirm  { session_id }
 *
 * Called by Settings → Billing when the customer returns from Stripe Checkout.
 * Verifies the checkout with Stripe and records the paid plan immediately,
 * so an upgrade never depends solely on the webhook arriving.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  const parsed = await readJsonObject(req)
  if (!parsed.ok) return parsed.response
  const sessionId = parsed.body.session_id
  if (typeof sessionId !== "string") {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 })
  }

  const stripe = getStripe()
  const admin = createAdminClient()

  try {
    const result = await confirmCheckoutSession(sessionId, auth.orgId, {
      // An expanded subscription already includes its `items` list.
      retrieveSession: (id) =>
        stripe.checkout.sessions.retrieve(id, { expand: ["subscription"] }),
      readLinkedSubscriptionId: async (orgId) => {
        const { data, error } = await admin
          .from("subscriptions")
          .select("stripe_subscription_id")
          .eq("org_id", orgId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return data?.stripe_subscription_id ?? null
      },
      upsertSubscription: async (row) => {
        const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "org_id" })
        if (error) throw new Error(error.message)
      },
    })

    if (result.status === "forbidden" || result.status === "invalid") {
      console.warn(`[stripe/confirm] ${result.status} session=${sessionId} org=${auth.orgId}`)
    }
    const httpStatus =
      result.status === "forbidden" ? 403 : result.status === "invalid" ? 400 : 200
    return NextResponse.json(result, { status: httpStatus })
  } catch (err) {
    console.error("[stripe/confirm] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Could not confirm checkout" }, { status: 500 })
  }
}
