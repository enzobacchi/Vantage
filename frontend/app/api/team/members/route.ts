import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type OrgMemberResponse = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  created_at: string;
};

export async function GET() {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, created_at")
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[team/members] GET:", error.message);
    return NextResponse.json({ error: "Failed to load team." }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json([] as OrgMemberResponse[]);
  }

  const members: OrgMemberResponse[] = [];
  for (const row of rows as {
    id: string;
    user_id: string;
    role: string;
    created_at: string;
  }[]) {
    const { data: user } = await supabase.auth.admin.getUserById(row.user_id);
    const email = user?.user?.email ?? "";
    const name =
      (user?.user?.user_metadata?.full_name as string) ??
      (user?.user?.user_metadata?.name as string) ??
      email?.split("@")[0] ??
      "—";
    members.push({
      id: row.id,
      user_id: row.user_id,
      email,
      name: String(name).trim() || "—",
      role: row.role as "owner" | "admin" | "member",
      created_at: row.created_at,
    });
  }

  return NextResponse.json(members);
}
