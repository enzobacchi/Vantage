import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

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
  const rawCookie = cookieStore.get("qb_pending_org_id")?.value;
  if (!rawCookie) {
    return NextResponse.json({ linked: false });
  }

  const clearCookie = (body: Record<string, unknown>, status = 200) => {
    const res = NextResponse.json(body, { status });
    res.cookies.set("qb_pending_org_id", "", { path: "/", maxAge: 0 });
    return res;
  };

  // The cookie is an AES-256-GCM token (set by the QB callback). Decrypting it
  // proves it was issued by our server for this org — a forged/guessed value
  // fails the auth tag and is rejected. This binds the claim to the browser
  // that actually completed the QB OAuth.
  let pendingOrgId: string;
  try {
    pendingOrgId = decrypt(rawCookie);
  } catch {
    return clearCookie({ linked: false });
  }

  const admin = createAdminClient();

  // Defense in depth beyond the unforgeable cookie: only claim an UNCLAIMED
  // org (zero members) that genuinely originated from the QB flow (has a
  // qb_realm_id). The first legitimate claimer becomes owner — a zero-member
  // org needs one, and "member" would leave it unmanageable.
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, qb_realm_id")
    .eq("id", pendingOrgId)
    .maybeSingle();

  if (orgError) {
    console.error("[auth/link-pending-org] org lookup:", orgError.message);
    return NextResponse.json({ error: "Failed to link QuickBooks organization." }, { status: 500 });
  }
  if (!org || !org.qb_realm_id) {
    return clearCookie({ linked: false });
  }

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
