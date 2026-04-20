import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

function countRows(csv: string): number {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; csv?: unknown; summary?: unknown }
    | null;

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const csv = typeof body?.csv === "string" ? body.csv : "";
  const summary = typeof body?.summary === "string" ? body.summary.slice(0, 500) : "";

  if (!title || !csv) {
    return NextResponse.json({ error: "Missing title or csv" }, { status: 400 });
  }
  if (csv.length > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "Report too large to save" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("saved_reports")
    .insert({
      organization_id: auth.orgId,
      created_by_user_id: auth.userId,
      title,
      type: "CSV",
      content: csv,
      query: "",
      summary,
      records_count: countRows(csv),
      visibility: "private",
    })
    .select("id, title, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save report", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, report: data });
}
