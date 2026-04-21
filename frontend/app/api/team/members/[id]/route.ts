import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VALID_ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof VALID_ROLES)[number];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can change member roles." },
      { status: 403 }
    );
  }

  const { id: memberId } = await params;

  let body: { role?: unknown };
  try {
    body = (await request.json()) as { role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.role !== "string" || !VALID_ROLES.includes(body.role as Role)) {
    return NextResponse.json(
      { error: "role must be one of: owner, admin, member." },
      { status: 400 }
    );
  }
  const newRole = body.role as Role;

  const supabase = createAdminClient();

  const { data: target } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const targetRow = target as { user_id: string; role: string };

  if (targetRow.role === "owner" && newRole !== "owner") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.orgId)
      .eq("role", "owner");
    if (count !== null && count <= 1) {
      return NextResponse.json(
        { error: "Cannot demote the last owner. Promote another member to owner first." },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("organization_id", ctx.orgId);

  if (error) {
    console.error("[team/members PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
