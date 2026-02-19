import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing task id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing } = await supabase
      .from("tasks")
      .select("id,is_completed")
      .eq("id", id)
      .eq("organization_id", auth.orgId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .update({ is_completed: !existing.is_completed })
      .eq("id", id)
      .eq("organization_id", auth.orgId)
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
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing task id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("organization_id", auth.orgId);

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
