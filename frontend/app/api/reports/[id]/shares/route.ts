import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Visibility convention:
 *   - "private"  → not shared (no rows in report_shares)
 *   - "shared"   → shared with whole organization
 *   - "specific" → shared with explicit user_ids (rows in report_shares)
 */

async function loadReportForOwner(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  orgId: string,
  userId: string
) {
  const { data } = await supabase
    .from("saved_reports")
    .select("id, created_by_user_id, visibility")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return { ok: false as const, status: 404, message: "Report not found." };
  if (data.created_by_user_id && data.created_by_user_id !== userId) {
    return {
      ok: false as const,
      status: 403,
      message: "Only the report creator can manage sharing.",
    };
  }
  return { ok: true as const, report: data };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data: report } = await supabase
    .from("saved_reports")
    .select("id, visibility")
    .eq("id", id)
    .eq("organization_id", auth.orgId)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("report_shares")
    .select("user_id")
    .eq("report_id", id);

  return NextResponse.json({
    organization_wide: report.visibility === "shared",
    visibility: report.visibility ?? "private",
    user_ids: (rows ?? []).map((r) => r.user_id as string),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as
    | { user_ids?: unknown; organization_wide?: unknown }
    | null;

  const organizationWide = body?.organization_wide === true;
  const userIds = Array.isArray(body?.user_ids)
    ? (body.user_ids as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const gate = await loadReportForOwner(supabase, id, auth.orgId, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  // Always replace the full share list: clear first, then insert if applicable.
  const { error: deleteErr } = await supabase
    .from("report_shares")
    .delete()
    .eq("report_id", id);
  if (deleteErr) {
    console.error("[reports/[id]/shares] delete:", deleteErr.message);
    return NextResponse.json(
      { error: "Failed to update sharing." },
      { status: 500 }
    );
  }

  let visibility: "private" | "shared" | "specific" = "private";
  if (organizationWide) {
    visibility = "shared";
  } else if (userIds.length > 0) {
    visibility = "specific";
    const { error: insertErr } = await supabase
      .from("report_shares")
      .insert(userIds.map((uid) => ({ report_id: id, user_id: uid })));
    if (insertErr) {
      console.error("[reports/[id]/shares] insert:", insertErr.message);
      return NextResponse.json(
        { error: "Failed to update sharing." },
        { status: 500 }
      );
    }
  }

  const { error: updateErr } = await supabase
    .from("saved_reports")
    .update({ visibility })
    .eq("id", id)
    .eq("organization_id", auth.orgId);
  if (updateErr) {
    console.error("[reports/[id]/shares] visibility:", updateErr.message);
    return NextResponse.json(
      { error: "Failed to update sharing." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    visibility,
    organization_wide: organizationWide,
    user_ids: organizationWide ? [] : userIds,
  });
}
