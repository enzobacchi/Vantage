import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { revokeToken } from "@/lib/gmail/oauth";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("gmail_credentials")
    .select("refresh_token_encrypted")
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId)
    .maybeSingle();

  if (row?.refresh_token_encrypted) {
    try {
      const refreshToken = decrypt(row.refresh_token_encrypted);
      await revokeToken(refreshToken);
    } catch (e) {
      console.warn("[Gmail disconnect] revoke failed:", e);
    }
  }

  const { error } = await admin
    .from("gmail_credentials")
    .delete()
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
