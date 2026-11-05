import type { createAdminClient } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe"

/**
 * Permanent organization deletion, shared by web Settings → Delete
 * Organization and mobile DELETE /api/account.
 *
 * Schema facts this relies on (verified against production 2026-11-04):
 * deleting an `organizations` row cascades every org-scoped table EXCEPT
 * `donors` and `donations` (both ON DELETE NO ACTION), and deleting a donor
 * cascades interactions/notes/tags/pledges/opportunities but not donations.
 * So the only safe order is donations → donors → org row. Deleting an
 * `auth.users` row cascades only that user's memberships, Gmail credentials,
 * push tokens and feedback; donor assignments become NULL.
 */

export type TeardownAdmin = ReturnType<typeof createAdminClient>

/** Stripe statuses that are already final: nothing left to cancel. */
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"])

type StripeSubscriptions = {
  retrieve(id: string): Promise<{ status: string }>
  cancel(id: string): Promise<unknown>
}

/**
 * Cancel a Stripe subscription unless Stripe says it has already ended.
 * Asks Stripe rather than trusting our `subscriptions` row, which only
 * updates when a webhook lands: after a partial failure the row can still
 * say "active" while Stripe has canceled, and a retry must not get stuck on
 * "already canceled". A subscription Stripe doesn't know is treated as ended.
 */
export function stripeCancelIfLive(subscriptions: StripeSubscriptions) {
  return async (id: string): Promise<void> => {
    try {
      const sub = await subscriptions.retrieve(id)
      if (ENDED_STATUSES.has(sub.status)) return
      await subscriptions.cancel(id)
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "resource_missing") return
      throw err
    }
  }
}

type TeardownOptions = {
  /** Cancels a Stripe subscription by id unless it has ended. Injected for tests. */
  cancelSubscription?: (stripeSubscriptionId: string) => Promise<unknown>
}

/**
 * Cancel the org's Stripe subscription if it can still bill. Throws on any
 * failure, including a failed lookup: an org deleted with a live
 * subscription keeps charging and leaves no UI to cancel it.
 */
export async function cancelOrgSubscription(
  admin: TeardownAdmin,
  orgId: string,
  cancel: (id: string) => Promise<unknown> = (id) => stripeCancelIfLive(getStripe().subscriptions)(id)
): Promise<void> {
  const { data: sub, error } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) throw new Error(`Could not check the subscription: ${error.message}`)

  const row = sub as { stripe_subscription_id: string | null; status: string } | null
  // Any linked Stripe subscription goes to Stripe, whatever our row says.
  if (!row?.stripe_subscription_id) return

  try {
    await cancel(row.stripe_subscription_id)
  } catch (err) {
    throw new Error(
      `Could not cancel the subscription: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Delete an organization and all of its data. Cancels billing first and
 * deletes nothing if that fails. Every step checks its error and stops, so a
 * failure leaves the org row in place and the caller can retry.
 */
export async function deleteOrganizationData(
  admin: TeardownAdmin,
  orgId: string,
  options: TeardownOptions = {}
): Promise<void> {
  await cancelOrgSubscription(admin, orgId, options.cancelSubscription)

  const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
    ["donations", () => admin.from("donations").delete().eq("org_id", orgId)],
    ["donors", () => admin.from("donors").delete().eq("org_id", orgId)],
    // Cascades every other org-scoped table, memberships included.
    ["organization", () => admin.from("organizations").delete().eq("id", orgId)],
  ]
  for (const [label, run] of steps) {
    const { error } = await run()
    if (error) throw new Error(`Could not delete ${label}: ${error.message}`)
  }
}

/**
 * Delete the logins of users who no longer belong to any organization.
 * Without this, `getCurrentUserOrg` in lib/auth.ts would quietly create a
 * fresh empty org with a new trial on their next sign-in. Users still in
 * another org keep their login. Never throws: by the time this runs the org
 * is already gone, so failures are logged and returned for the caller.
 */
export async function removeOrphanedLogins(
  admin: TeardownAdmin,
  userIds: string[]
): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = []
  const failed: string[] = []
  for (const userId of new Set(userIds)) {
    const { data, error } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
    if (error) {
      console.error("[org-teardown] membership lookup failed:", userId, error.message)
      failed.push(userId)
      continue
    }
    if ((data ?? []).length > 0) continue

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error("[org-teardown] login delete failed:", userId, deleteError.message)
      failed.push(userId)
    } else {
      removed.push(userId)
    }
  }
  return { removed, failed }
}
