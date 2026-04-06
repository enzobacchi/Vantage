import { createServerSupabaseClient, getUserFromBearerToken } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CurrentUserOrg = {
  userId: string;
  orgId: string;
};

export type CurrentUserOrgWithRole = CurrentUserOrg & {
  role: string;
};

/**
 * Shared helper: authenticates the user via cookie or Bearer token.
 */
async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: cookieUser },
    error: sessionError,
  } = await supabase.auth.getUser();
  return cookieUser && !sessionError ? cookieUser : await getUserFromBearerToken();
}

/**
 * Shared helper: picks the best org membership for a user.
 * Prefers multi-member orgs (real shared orgs) over solo auto-created placeholders.
 * Returns the chosen membership with org ID and role, or null if no memberships exist.
 */
async function pickBestMembership(
  userId: string
): Promise<{ organization_id: string; role: string } | null> {
  const admin = createAdminClient();
  const { data: members, error: memberError } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (memberError || !members || members.length === 0) {
    return null;
  }

  const orgIds = members.map((m) => m.organization_id);

  // Single query to get all members for candidate orgs, then count in JS
  const { data: allMembers } = await admin
    .from("organization_members")
    .select("organization_id")
    .in("organization_id", orgIds);

  const countByOrg = new Map<string, number>();
  for (const row of allMembers ?? []) {
    const oid = row.organization_id;
    countByOrg.set(oid, (countByOrg.get(oid) ?? 0) + 1);
  }

  // Prefer a multi-member org (in recency order)
  for (const m of members) {
    if ((countByOrg.get(m.organization_id) ?? 0) > 1) {
      return { organization_id: m.organization_id, role: m.role ?? "member" };
    }
  }

  // Fall back to most recent membership if all are solo orgs
  return { organization_id: members[0].organization_id, role: members[0].role ?? "member" };
}

/**
 * Returns the current user's ID and their organization ID (first membership).
 * Use in API routes and server code to scope data. Returns null if not logged in.
 * If the user has no organization yet, a default org is created and the user is added
 * so the dashboard and other org-scoped APIs can load.
 */
export async function getCurrentUserOrg(): Promise<CurrentUserOrg | null> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return null;
  }

  const membership = await pickBestMembership(user.id);

  if (!membership) {
    // User has no org (e.g. email signup). Create a default org and add them so dashboard loads.
    const admin = createAdminClient();
    const { data: newOrg, error: orgError } = await admin
      .from("organizations")
      .insert({ name: "My Organization" })
      .select("id")
      .single();

    if (orgError || !newOrg?.id) {
      return null;
    }

    const { error: linkError } = await admin
      .from("organization_members")
      .upsert(
        { user_id: user.id, organization_id: (newOrg as { id: string }).id, role: "owner" },
        { onConflict: "user_id,organization_id" }
      );

    if (linkError) {
      return null;
    }

    return { userId: user.id, orgId: (newOrg as { id: string }).id };
  }

  return { userId: user.id, orgId: membership.organization_id };
}

/**
 * Like getCurrentUserOrg but also returns the current user's role in that org.
 * Uses the same org-selection logic (prefers multi-member orgs).
 * Use for team/invite actions that require owner or admin.
 */
export async function getCurrentUserOrgWithRole(): Promise<CurrentUserOrgWithRole | null> {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return null;
  }

  const membership = await pickBestMembership(user.id);
  if (!membership) {
    return null;
  }

  return {
    userId: user.id,
    orgId: membership.organization_id,
    role: membership.role,
  };
}

/**
 * Same as getCurrentUserOrg but returns 401 JSON response if not authenticated or no org.
 * Use in API routes: return await requireUserOrg() to exit early with 401.
 */
export async function requireUserOrg(): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; response: Response }
> {
  const result = await getCurrentUserOrg();
  if (result) {
    return { ok: true, userId: result.userId, orgId: result.orgId };
  }
  return {
    ok: false,
    response: new Response(
      JSON.stringify({ error: "Unauthorized", details: "Sign in and connect an organization." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    ),
  };
}
