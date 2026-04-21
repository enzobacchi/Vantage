import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function canManageTeam(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTeam(ctx.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can revoke invites." },
      { status: 403 }
    );
  }

  const { id } = await params;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.orgId);

  if (error) {
    console.error("[team/invitations DELETE]", error.message);
    return NextResponse.json({ error: "Failed to revoke invitation." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
