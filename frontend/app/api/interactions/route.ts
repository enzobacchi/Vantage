import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = await request.json();

  const validTypes = ["email", "call", "meeting", "note", "task"] as const;
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: "Invalid interaction type" }, { status: 400 });
  }

  if (!body.donor_id) {
    return NextResponse.json({ error: "donor_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify donor belongs to org
  const { data: donor } = await supabase
    .from("donors")
    .select("id")
    .eq("id", body.donor_id)
    .eq("org_id", auth.orgId)
    .maybeSingle();

  if (!donor) {
    return NextResponse.json({ error: "Donor not found" }, { status: 404 });
  }

  const row = {
    donor_id: body.donor_id,
    type: body.type,
    direction: body.direction ?? null,
    subject: body.subject ?? null,
    content: body.content ?? "",
    date: body.date ?? new Date().toISOString(),
    status: body.type === "task" ? (body.status ?? "pending") : null,
  };

  const { data: inserted, error } = await supabase
    .from("interactions")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
