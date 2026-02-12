import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type SavedReportRow = {
  id: string;
  title: string;
  query: string | null;
  type: string | null;
  summary: string | null;
  records_count?: number | null;
  created_at: string;
};

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,query,type,summary,records_count,created_at")
    .eq("organization_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load saved reports.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as SavedReportRow[]);
}

