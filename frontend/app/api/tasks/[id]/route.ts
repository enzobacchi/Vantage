import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getCurrentOrgId(supabase: ReturnType<typeof createAdminClient>) {
  let result = await supabase
    .from("organizations")
    .select("id")
    .not("qb_refresh_token", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error && result.error.message?.includes("updated_at")) {
    result = await supabase
      .from("organizations")
      .select("id")
      .not("qb_refresh_token", "is", null)
      .limit(1)
      .maybeSingle();
  }
  return result.data?.id ?? null;
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing task id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = await getCurrentOrgId(supabase);
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found. Connect QuickBooks first." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("tasks")
      .select("id,is_completed")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .update({ is_completed: !existing.is_completed })
      .eq("id", id)
      .eq("organization_id", orgId)
      .select("id,title,is_completed,created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update task.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ task });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Task update failed.", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing task id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = await getCurrentOrgId(supabase);
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found. Connect QuickBooks first." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete task.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Task delete failed.", details: message },
      { status: 500 }
    );
  }
}
