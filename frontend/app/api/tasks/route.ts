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

export async function GET() {
  try {
    const supabase = createAdminClient();
    const orgId = await getCurrentOrgId(supabase);
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found. Connect QuickBooks first." },
        { status: 400 }
      );
    }

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id,title,is_completed,created_at")
      .eq("organization_id", orgId)
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
    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Missing or invalid title." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const orgId = await getCurrentOrgId(supabase);
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found. Connect QuickBooks first." },
        { status: 400 }
      );
    }

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        title,
        is_completed: false,
        organization_id: orgId,
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
