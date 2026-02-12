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
  const { error } = await admin
    .from("organization_members")
    .upsert(
      { user_id: user.id, organization_id: pendingOrgId, role: "member" },
      { onConflict: "user_id,organization_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: "Failed to link QuickBooks organization.", details: error.message },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ linked: true });
  res.cookies.set("qb_pending_org_id", "", { path: "/", maxAge: 0 });
  return res;
}
