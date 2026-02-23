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
  folder_id: string | null;
  visibility: string | null;
  created_by_user_id: string | null;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const folderIdParam = searchParams.get("folderId");

  const supabase = createAdminClient();
  const baseSelect = "id,title,query,type,summary,records_count,created_at,folder_id,visibility,created_by_user_id";

  let query = supabase
    .from("saved_reports")
    .select(baseSelect)
    .eq("organization_id", auth.orgId)
    .or(`visibility.eq.shared,created_by_user_id.eq.${auth.userId},created_by_user_id.is.null`)
    .order("created_at", { ascending: false });

  if (folderIdParam === "") {
    query = query.is("folder_id", null);
  } else if (folderIdParam) {
    query = query.eq("folder_id", folderIdParam);
  }

  let { data, error } = await query;

  // If folder_id column doesn't exist yet (migration not run), retry without it
  const columnMissing =
    error?.message?.includes("folder_id") ||
    error?.message?.includes("visibility") ||
    error?.message?.includes("created_by_user_id") ||
    error?.message?.includes("does not exist") ||
    error?.code === "42703";
  if (error && columnMissing) {
    const fallbackSelect = "id,title,query,type,summary,records_count,created_at";
    const fallback = await supabase
      .from("saved_reports")
      .select(fallbackSelect)
      .eq("organization_id", auth.orgId)
      .order("created_at", { ascending: false });
    if (!fallback.error) {
      data = (fallback.data ?? []).map((row) => ({ ...row, folder_id: null, visibility: null, created_by_user_id: null }));
      error = null;
    }
  }

  if (error) {
    return NextResponse.json(
      { error: "Failed to load saved reports.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as SavedReportRow[]);
}

