import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: { name?: unknown; sort_order?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    payload.name = body.name.trim();
  }

  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== "number") {
      return NextResponse.json({ error: "sort_order must be a number." }, { status: 400 });
    }
    payload.sort_order = body.sort_order;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("org_donation_options")
    .update(payload)
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An option with this name already exists." },
        { status: 409 }
      );
    }
    console.error("[donations/options PATCH]", error.message);
    return NextResponse.json({ error: "Failed to update option." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("org_donation_options")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);

  if (error) {
    console.error("[donations/options DELETE]", error.message);
    return NextResponse.json({ error: "Failed to delete option." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
