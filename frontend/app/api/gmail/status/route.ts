import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gmail_credentials")
    .select("google_email, needs_reauth")
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { connected: false, error: "Failed to load status.", details: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: data.google_email,
    needsReauth: data.needs_reauth === true,
  });
}
