import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CurrentUserOrg = {
  userId: string;
  orgId: string;
};

export type CurrentUserOrgWithRole = CurrentUserOrg & {
  role: string;
};

/**
 * Returns the current user's ID and their organization ID (first membership).
 * Use in API routes and server code to scope data. Returns null if not logged in.
 * If the user has no organization yet, a default org is created and the user is added
 * so the dashboard and other org-scoped APIs can load.
 */
export async function getCurrentUserOrg(): Promise<CurrentUserOrg | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user?.id) {
    return null;
  }

  const admin = createAdminClient();
  let { data: members, error: memberError } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (memberError) {
    return null;
  }

  // Pick the best org: prefer any org where the user is not the sole member
  // (i.e., a real shared org vs a solo auto-created placeholder).
  let chosenOrgId: string | null = null;
  if (members && members.length > 0) {
    for (const m of members as { organization_id: string }[]) {
      const { count } = await admin
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", m.organization_id);
      if (count !== null && count > 1) {
        chosenOrgId = m.organization_id;
        break;
      }
    }
    // Fall back to most recent membership (first in list) if all are solo orgs
    if (!chosenOrgId) {
      chosenOrgId = (members[0] as { organization_id: string }).organization_id;
    }
  }

  // Wrap result to match the shape previously returned by .maybeSingle()
  const member = chosenOrgId ? { organization_id: chosenOrgId } : null;

  if (!member?.organization_id) {
    // User has no org (e.g. email signup). Create a default org and add them so dashboard loads.
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

  return { userId: user.id, orgId: member.organization_id };
}

/**
 * Like getCurrentUserOrg but also returns the current user's role in that org.
 * Use for team/invite actions that require owner or admin.
 */
export async function getCurrentUserOrgWithRole(): Promise<CurrentUserOrgWithRole | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user?.id) {
    return null;
  }

  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memberError || !member?.organization_id) {
    return null;
  }

  return {
    userId: user.id,
    orgId: member.organization_id,
    role: member.role ?? "member",
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
