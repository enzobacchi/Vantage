import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account (App Store
 * Guideline 5.1.1(v) requires in-app account deletion; mobile calls this
 * from Settings → Delete Account after re-verifying the password).
 *
 * Org handling per membership:
 * - Solo org (caller is the only member): org data is deleted — any active
 *   Stripe subscription is canceled first, then donations/donors (no FK
 *   cascade from organizations), then the org row (cascades the rest).
 * - Shared org where caller is the only owner: 409 — ownership must be
 *   transferred first, otherwise the org would be orphaned.
 * - Shared org otherwise: membership row is removed, org data is untouched.
 *
 * Finally the auth user is deleted (gmail_credentials/push_tokens cascade).
 */
export async function DELETE() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser()

  if (sessionError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)

  for (const membership of memberships ?? []) {
    const orgId = membership.organization_id

    const { data: orgMembers } = await admin
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", orgId)

    const others = (orgMembers ?? []).filter((m) => m.user_id !== user.id)

    if (others.length === 0) {
      // Solo org — tear down org data entirely.
      await cancelStripeSubscription(admin, orgId)
      await admin.from("donations").delete().eq("org_id", orgId)
      await admin.from("donors").delete().eq("org_id", orgId)
      const { error: orgError } = await admin.from("organizations").delete().eq("id", orgId)
      if (orgError) {
        console.error("[account] org delete failed:", orgId, orgError.message)
        return NextResponse.json(
          { error: "Could not delete your organization data. Please contact support." },
          { status: 500 }
        )
      }
      continue
    }

    const otherOwners = others.filter((m) => m.role === "owner")
    if (membership.role === "owner" && otherOwners.length === 0) {
      return NextResponse.json(
        {
          error:
            "You are the only owner of an organization with other members. Transfer ownership in Settings → Team before deleting your account.",
        },
        { status: 409 }
      )
    }

    await admin
      .from("organization_members")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error("[account] auth user delete failed:", deleteError.message)
    return NextResponse.json(
      { error: "Could not delete your account. Please contact support." },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}

async function cancelStripeSubscription(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<void> {
  try {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("org_id", orgId)
      .maybeSingle()

    if (sub?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(sub.status)) {
      await getStripe().subscriptions.cancel(sub.stripe_subscription_id)
    }
  } catch (err) {
    // Best-effort: a failed cancel must not block account deletion, but it
    // must be loud in logs — an orphaned subscription keeps billing.
    console.error(
      "[account] Stripe cancel failed for org",
      orgId,
      err instanceof Error ? err.message : err
    )
  }
}
