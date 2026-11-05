import { removeOrphanedLogins, type TeardownAdmin } from "@/lib/org-teardown"

/**
 * Removing a team member, shared by the web server action
 * (app/actions/team.ts `removeMember`) and mobile
 * DELETE /api/team/members/[id].
 *
 * Who may remove whom:
 *   owner → anyone but themselves (never the last owner)
 *   admin → members only
 *   member → nobody
 * Nobody removes themselves here.
 *
 * Deleting the membership row fires the `clear_donor_assignments_on_member_removal`
 * trigger (their donors become unassigned). We then revoke the org API keys
 * they created (they saw the plaintext), delete the rows that are that
 * person's own within this org (Gmail token, push tokens, notification
 * preferences), and finally their login if they belong to no other org, so
 * `getCurrentUserOrg` doesn't hand them a fresh org on their next sign-in.
 *
 * Known, accepted races (no transaction across these steps):
 *  - Two owners removing each other at the same moment can both pass the
 *    last-owner check and leave the org with no owner. Fixing it needs a
 *    DB-side guard (trigger or RPC); support can restore an owner.
 *  - A request from the removed person landing between the membership delete
 *    and the login delete can auto-create a fresh org for them, and their
 *    login is then kept. Support can delete it.
 */

export type RemoveActor = { userId: string; orgId: string; role: string }

export type RemoveMemberResult =
  | { ok: true; removedUserId: string; warning?: string }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string }

type Denial = { status: 400 | 403; error: string }

/** Returns why `actor` may not remove `target`, or null if they may. */
export function removeMemberDenial(
  actor: { userId: string; role: string },
  target: { user_id: string; role: string }
): Denial | null {
  if (actor.role !== "owner" && actor.role !== "admin") {
    return { status: 403, error: "Only owners and admins can remove members." }
  }
  if (target.user_id === actor.userId) {
    return { status: 400, error: "You can't remove yourself from the organization." }
  }
  if (actor.role === "admin" && target.role !== "member") {
    return { status: 403, error: "Admins can only remove members. Ask an owner to remove admins or owners." }
  }
  return null
}

/** Per-person rows that belong to the member within this org. */
const PERSONAL_ORG_TABLES = ["gmail_credentials", "push_tokens", "notification_preferences"] as const

export async function removeOrgMember(
  admin: TeardownAdmin,
  actor: RemoveActor,
  memberId: string
): Promise<RemoveMemberResult> {
  if (actor.role !== "owner" && actor.role !== "admin") {
    return { ok: false, status: 403, error: "Only owners and admins can remove members." }
  }

  const { data: target, error: lookupError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("organization_id", actor.orgId)
    .maybeSingle()
  if (lookupError) {
    console.error("[team-members] lookup failed:", lookupError.message)
    return { ok: false, status: 500, error: "Could not remove member. Please try again." }
  }
  if (!target) return { ok: false, status: 404, error: "Member not found." }

  const row = target as { user_id: string; role: string }
  const denial = removeMemberDenial(actor, row)
  if (denial) return { ok: false, ...denial }

  if (row.role === "owner") {
    const { count, error: countError } = await admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actor.orgId)
      .eq("role", "owner")
    if (countError || count === null) {
      console.error("[team-members] owner count failed:", countError?.message)
      return { ok: false, status: 500, error: "Could not remove member. Please try again." }
    }
    if (count <= 1) {
      return { ok: false, status: 400, error: "Cannot remove the last owner. Make someone else an owner first." }
    }
  }

  // Match the role we checked, so a promotion in between can't slip past the
  // guards, and confirm a row was actually deleted (a double-click or a
  // concurrent removal deletes nothing).
  const { data: deleted, error: deleteError } = await admin
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("organization_id", actor.orgId)
    .eq("role", row.role)
    .select("id")
  if (deleteError) {
    console.error("[team-members] membership delete failed:", deleteError.message)
    return { ok: false, status: 500, error: "Could not remove member. Please try again." }
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, status: 404, error: "Member not found. They may already have been removed, or their role changed." }
  }

  // The member is out. Everything below is cleanup: failures become a warning.
  let cleanupFailed = false

  const { error: keysError } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", actor.orgId)
    .eq("created_by", row.user_id)
    .is("revoked_at", null)
  if (keysError) {
    console.error("[team-members] API key revoke failed:", row.user_id, keysError.message)
    cleanupFailed = true
  }

  for (const table of PERSONAL_ORG_TABLES) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("org_id", actor.orgId)
      .eq("user_id", row.user_id)
    if (error) {
      console.error(`[team-members] ${table} cleanup failed:`, row.user_id, error.message)
      cleanupFailed = true
    }
  }

  const { failed } = await removeOrphanedLogins(admin, [row.user_id])
  if (failed.length > 0) cleanupFailed = true

  return cleanupFailed
    ? {
        ok: true,
        removedUserId: row.user_id,
        warning:
          "Member removed, but some of their account cleanup didn't finish. Contact support@vantagedonorai.com and we'll finish it.",
      }
    : { ok: true, removedUserId: row.user_id }
}
