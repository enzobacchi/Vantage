import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserOrg } from "@/lib/auth";
import { readJsonObject } from "@/lib/http";

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
      console.error("[tasks] GET:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch tasks." },
        { status: 500 }
      );
    }

    return NextResponse.json({ tasks: tasks ?? [] });
  } catch (e) {
    console.error("[tasks] GET:", e);
    return NextResponse.json(
      { error: "Failed to fetch tasks." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUserOrg();
    if (!auth.ok) return auth.response;

    const parsed = await readJsonObject(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
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
      console.error("[tasks] POST:", error.message);
      return NextResponse.json(
        { error: "Failed to create task." },
        { status: 500 }
      );
    }

    return NextResponse.json({ task });
  } catch (e) {
    console.error("[tasks] POST:", e);
    return NextResponse.json(
      { error: "Failed to create task." },
      { status: 500 }
    );
  }
}
