import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,filter_criteria,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load saved reports.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; filter_criteria?: unknown }
    | null;

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const filter_criteria = body?.filter_criteria;

  if (!title) {
    return NextResponse.json({ error: "Missing title." }, { status: 400 });
  }
  if (filter_criteria == null || typeof filter_criteria !== "object") {
    return NextResponse.json({ error: "Missing filter_criteria." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("saved_reports")
    .insert({ title, filter_criteria })
    .select("id,title,filter_criteria,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ report: data });
}

