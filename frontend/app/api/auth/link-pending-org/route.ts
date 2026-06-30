import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * After "Sign in with QuickBooks" when the user wasn't logged in, they land on login
 * and sign in with email. Call this once after login to link the pending org (stored
 * in cookie) to the current user, then clear the cookie. Works even when the user
 * has no organization yet (e.g. just signed up).
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const pendingOrgId = cookieStore.get("qb_pending_org_id")?.value;
  if (!pendingOrgId) {
    return NextResponse.json({ linked: false });
  }

  const admin = createAdminClient();

  // The cookie only proves "someone completed QB OAuth for this org id"; it is
  // NOT proof this user owns the org. Only link to an UNCLAIMED org (zero
  // members) — i.e. a fresh placeholder created during the pre-signup QB flow.
  // An established org always has members, so a forged/replayed cookie can't
  // be used to self-join another tenant. The first user to claim becomes owner.
  const clearCookie = (body: Record<string, unknown>, status = 200) => {
    const res = NextResponse.json(body, { status });
    res.cookies.set("qb_pending_org_id", "", { path: "/", maxAge: 0 });
    return res;
  };

  const { count: memberCount, error: countError } = await admin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", pendingOrgId);

  if (countError) {
    console.error("[auth/link-pending-org] count:", countError.message);
    return NextResponse.json({ error: "Failed to link QuickBooks organization." }, { status: 500 });
  }

  if ((memberCount ?? 0) > 0) {
    // Already claimed — refuse and drop the cookie. (Legitimately re-running
    // this after a prior successful link is a no-op, which is fine.)
    return clearCookie({ linked: false });
  }

  const { error } = await admin
    .from("organization_members")
    .upsert(
      { user_id: user.id, organization_id: pendingOrgId, role: "owner" },
      { onConflict: "user_id,organization_id" }
    );

  if (error) {
    console.error("[auth/link-pending-org]", error.message);
    return NextResponse.json(
      { error: "Failed to link QuickBooks organization." },
      { status: 500 }
    );
  }

  return clearCookie({ linked: true });
}
