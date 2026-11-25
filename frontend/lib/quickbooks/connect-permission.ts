/**
 * Who may bind QuickBooks OAuth tokens to an organization.
 *
 * Connecting (or reconnecting) QuickBooks replaces the org's realm and tokens,
 * which repoints every future sync at whatever company file the user picks.
 * That is an org-admin action, so plain members are refused both when the
 * OAuth flow starts (`/api/quickbooks/auth`) and again in the callback before
 * any token write (the callback is reachable directly).
 */

/** Roles allowed to connect, reconnect, or replace the org's QuickBooks link. */
export function canManageQuickBooks(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether an OAuth start/callback may proceed for this caller.
 *
 * `membership` is the org the tokens would be bound to (from
 * `pickBestMembership`), or null when there is none:
 * - signed out — the "Sign in with QuickBooks" flow binds tokens to a new,
 *   unclaimed org that the user claims as owner afterwards;
 * - signed in with no membership — the callback creates a fresh org and makes
 *   the user its owner.
 * Neither touches an existing org, so both are allowed.
 */
export function mayBindQuickBooks(
  membership: { role: string | null | undefined } | null
): boolean {
  return membership === null || canManageQuickBooks(membership.role);
}

/**
 * Signed-out ("Sign in with QuickBooks") callback: may it write tokens for this
 * realm? `existingOrgMemberCount` is the member count of the org that already
 * holds the realm, or null when no org does.
 *
 * Only an unknown realm or a still-unclaimed (zero-member) org may be written.
 * A claimed org must be reconnected by its owner/admin from Settings —
 * otherwise anyone able to authorize the QuickBooks company at Intuit could
 * replace that org's tokens without any role in it.
 */
export function maySignedOutBindRealm(existingOrgMemberCount: number | null): boolean {
  return existingOrgMemberCount === null || existingOrgMemberCount === 0;
}

/** `?qb=` value the routes redirect with when a member is refused. */
export const QB_FORBIDDEN_ROLE_PARAM = "forbidden_role";

/** `/login?error=` value when a signed-out flow hits an already-claimed realm. */
export const QB_REALM_CLAIMED_LOGIN_ERROR = "qb_realm_claimed";
