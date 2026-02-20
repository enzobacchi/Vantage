import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { savedReportsQuery } from "@/lib/supabase/scoped";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const orgId = auth.orgId;

  // If the table is empty, selecting '*' won't reveal columns.
  // Instead, probe a set of likely column names via select("<col>") and see which succeed.
  const candidates = [
    "id",
    "title",
    "name",
    "report_name",
    "user_query",
    "query",
    "sql_query",
    "type",
    "content",
    "summary",
    "records_count",
    "filter_criteria",
    "created_at",
    "updated_at",
    "org_id",
    "qb_realm_id",
    "realm_id",
  ];

  const exists: string[] = [];
  const missing: Array<{ col: string; error: string }> = [];

  for (const col of candidates) {
    const { error } = await savedReportsQuery(supabase, orgId).select(col).limit(1);
    if (!error) exists.push(col);
    else missing.push({ col, error: error.message });
  }

  // Also check if selecting a typical projection works (helps confirm table access).
  const sanity = await savedReportsQuery(supabase, orgId).select("id").limit(1);

  return NextResponse.json({
    exists,
    missing: missing.slice(0, 5), // keep output small
    sanityError: sanity.error?.message ?? null,
  });
}

