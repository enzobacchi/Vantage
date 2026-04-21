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

export type ReportUserRef = {
  user_id: string;
  full_name: string | null;
};

export type SavedReportListItem = SavedReportRow & {
  shares: ReportUserRef[];
  creator: ReportUserRef | null;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const folderIdParam = searchParams.get("folderId");
  const includeShares = (searchParams.get("include") ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("shares");

  const supabase = createAdminClient();
  const baseSelect = "id,title,query,type,summary,records_count,created_at,folder_id,visibility,created_by_user_id";

  // Fetch report IDs specifically shared with this user (visibility = "specific")
  const { data: sharedWithMe } = await supabase
    .from("report_shares")
    .select("report_id")
    .eq("user_id", auth.userId);
  const sharedReportIds = (sharedWithMe ?? []).map((r) => r.report_id);

  let orFilter = `visibility.eq.shared,created_by_user_id.eq.${auth.userId},created_by_user_id.is.null`;
  if (sharedReportIds.length > 0) {
    orFilter += `,id.in.(${sharedReportIds.join(",")})`;
  }

  let query = supabase
    .from("saved_reports")
    .select(baseSelect)
    .eq("organization_id", auth.orgId)
    .or(orFilter)
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
    console.error("[reports] GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load saved reports." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as SavedReportRow[];

  if (!includeShares) {
    return NextResponse.json(rows);
  }

  const reportIds = rows.map((r) => r.id);
  const { data: shareRows } = reportIds.length
    ? await supabase
        .from("report_shares")
        .select("report_id,user_id")
        .in("report_id", reportIds)
    : { data: [] as { report_id: string; user_id: string }[] };

  const sharesByReport = new Map<string, string[]>();
  for (const s of shareRows ?? []) {
    const list = sharesByReport.get(s.report_id) ?? [];
    list.push(s.user_id);
    sharesByReport.set(s.report_id, list);
  }

  const userIds = new Set<string>();
  for (const r of rows) if (r.created_by_user_id) userIds.add(r.created_by_user_id);
  for (const ids of sharesByReport.values()) for (const id of ids) userIds.add(id);

  const userRefs = new Map<string, ReportUserRef>();
  await Promise.all(
    [...userIds].map(async (uid) => {
      const { data: u } = await supabase.auth.admin.getUserById(uid);
      const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && meta.name) ||
        u?.user?.email?.split("@")[0] ||
        null;
      userRefs.set(uid, { user_id: uid, full_name: fullName ? String(fullName).trim() : null });
    })
  );

  const enriched: SavedReportListItem[] = rows.map((r) => ({
    ...r,
    shares: (sharesByReport.get(r.id) ?? []).map(
      (uid) => userRefs.get(uid) ?? { user_id: uid, full_name: null }
    ),
    creator: r.created_by_user_id
      ? userRefs.get(r.created_by_user_id) ?? { user_id: r.created_by_user_id, full_name: null }
      : null,
  }));

  return NextResponse.json(enriched);
}

type CreateReportBody = {
  title?: unknown;
  tagIds?: unknown;
  selectedColumns?: unknown;
  search?: unknown;
  visibility?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as CreateReportBody | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Report title is required." }, { status: 400 });
  }

  const tagIds = Array.isArray(body?.tagIds)
    ? body.tagIds.filter((v): v is string => typeof v === "string")
    : [];
  const selectedColumns = Array.isArray(body?.selectedColumns)
    ? body.selectedColumns.filter((v): v is string => typeof v === "string")
    : [];
  const search = typeof body?.search === "string" ? body.search.trim() : "";
  const visibility: "private" | "shared" =
    body?.visibility === "private" ? "private" : "shared";

  const criteria: Record<string, unknown> = { source: "crm" };
  if (search) criteria.search = search;
  if (tagIds.length) criteria.tagIds = tagIds;
  if (selectedColumns.length) criteria.selectedColumns = selectedColumns;

  const summaryParts: string[] = [];
  if (search) summaryParts.push(`Search: "${search}"`);
  if (tagIds.length) summaryParts.push(`Tags: ${tagIds.length} selected`);
  const summary = summaryParts.length ? summaryParts.join(" · ") : "CRM filters";

  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from("saved_reports")
    .insert({
      organization_id: auth.orgId,
      title,
      type: "crm",
      summary,
      query: JSON.stringify(criteria),
      visibility,
      created_by_user_id: auth.userId,
    })
    .select("id,title,type,summary,created_at,visibility,created_by_user_id")
    .single();

  // Tolerate older schemas without optional columns
  const colMissing =
    error?.message?.includes("created_by_user_id") ||
    error?.message?.includes("visibility") ||
    error?.message?.includes("summary");
  if (error && colMissing) {
    const fallback = await supabase
      .from("saved_reports")
      .insert({
        organization_id: auth.orgId,
        title,
        type: "crm",
        query: JSON.stringify(criteria),
      })
      .select("id,title,type,created_at")
      .single();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error || !data) {
    console.error("[reports] POST:", error?.message);
    return NextResponse.json({ error: "Failed to create report." }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

