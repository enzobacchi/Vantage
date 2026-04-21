import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCurrentUserOrgWithRole();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.role !== "owner" && auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: members, error: memberError } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", auth.orgId);

  if (memberError) {
    return NextResponse.json(
      { error: memberError.message },
      { status: 500 }
    );
  }

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const { data: creds } = await admin
    .from("gmail_credentials")
    .select("user_id, google_email, needs_reauth")
    .eq("org_id", auth.orgId)
    .in("user_id", userIds);

  const credsByUser = new Map(
    (creds ?? []).map((c) => [
      c.user_id,
      { email: c.google_email as string, needsReauth: c.needs_reauth === true },
    ])
  );

  return NextResponse.json({
    members: (members ?? []).map((m) => {
      const cred = credsByUser.get(m.user_id);
      return {
        userId: m.user_id,
        role: m.role,
        gmailConnected: !!cred,
        gmailEmail: cred?.email ?? null,
        needsReauth: cred?.needsReauth ?? false,
      };
    }),
  });
}
