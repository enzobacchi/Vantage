import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id,title,is_completed,created_at")
      .eq("organization_id", auth.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch tasks.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ tasks: tasks ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Tasks fetch failed.", details: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Missing or invalid title." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        title,
        is_completed: false,
        organization_id: auth.orgId,
      })
      .select("id,title,is_completed,created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create task.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ task });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Task create failed.", details: message },
      { status: 500 }
    );
  }
}
