import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch the task
  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id, donor_id, status")
    .eq("id", id)
    .eq("type", "task")
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Verify donor belongs to org
  const { data: donor } = await supabase
    .from("donors")
    .select("id")
    .eq("id", existing.donor_id)
    .eq("org_id", auth.orgId)
    .maybeSingle();

  if (!donor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const newStatus = existing.status === "completed" ? "pending" : "completed";
  const { data: updated, error } = await supabase
    .from("interactions")
    .update({ status: newStatus })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[interactions/[id]/toggle]", error.message);
    return NextResponse.json({ error: "Failed to toggle interaction status." }, { status: 500 });
  }

  return NextResponse.json(updated);
}
