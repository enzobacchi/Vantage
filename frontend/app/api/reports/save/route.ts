import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; query?: unknown }
    | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!name || !query) {
    return NextResponse.json(
      { error: "Missing report name or query." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("saved_reports")
    .insert({
      organization_id: auth.orgId,
      title: name,
      type: "QUERY",
      query,
      content: "",
      summary: "",
    })
    .select("id,title,query,type,summary,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

