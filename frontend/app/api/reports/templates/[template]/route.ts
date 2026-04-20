import { NextRequest, NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { priorPeriod } from "@/lib/fiscal-year";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATES = {
  retention: "report_retention_rate",
  acquisition: "report_acquisition_rate",
  recapture: "report_recapture",
  "new-leads-by-source": "report_new_leads_by_source",
} as const;

type TemplateKey = keyof typeof TEMPLATES;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isTemplateKey(key: string): key is TemplateKey {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, key);
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

type Json = Record<string, unknown>;

/** Convert RPC result to a flat CSV body suitable for save/export. */
function buildCsv(template: TemplateKey, data: Json): string {
  switch (template) {
    case "retention": {
      const retained = (data.retained as Array<{ id: string; display_name: string | null }>) ?? [];
      const lapsed = (data.lapsed as Array<{ id: string; display_name: string | null }>) ?? [];
      const rows = [
        ...retained.map((d) => ({ status: "retained", donor_id: d.id, display_name: d.display_name ?? "" })),
        ...lapsed.map((d) => ({ status: "lapsed", donor_id: d.id, display_name: d.display_name ?? "" })),
      ];
      return toCsv(rows, ["status", "donor_id", "display_name"]);
    }
    case "acquisition": {
      const donors =
        (data.donors as Array<{
          id: string;
          display_name: string | null;
          first_gift_date: string | null;
          first_gift_amount: number | null;
        }>) ?? [];
      return toCsv(
        donors.map((d) => ({
          donor_id: d.id,
          display_name: d.display_name ?? "",
          first_gift_date: d.first_gift_date ?? "",
          first_gift_amount: d.first_gift_amount ?? "",
        })),
        ["donor_id", "display_name", "first_gift_date", "first_gift_amount"]
      );
    }
    case "recapture": {
      const donors =
        (data.donors as Array<{
          id: string;
          display_name: string | null;
          previous_gift_date: string | null;
          recapture_gift_date: string | null;
          recapture_amount: number | null;
        }>) ?? [];
      return toCsv(
        donors.map((d) => ({
          donor_id: d.id,
          display_name: d.display_name ?? "",
          previous_gift_date: d.previous_gift_date ?? "",
          recapture_gift_date: d.recapture_gift_date ?? "",
          recapture_amount: d.recapture_amount ?? "",
        })),
        ["donor_id", "display_name", "previous_gift_date", "recapture_gift_date", "recapture_amount"]
      );
    }
    case "new-leads-by-source": {
      const rows =
        (data.rows as Array<{ source: string; donor_count: number; total_raised: number }>) ?? [];
      return toCsv(
        rows.map((r) => ({
          source: r.source,
          donor_count: r.donor_count,
          total_raised: r.total_raised,
        })),
        ["source", "donor_count", "total_raised"]
      );
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ template: string }> }
) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { template } = await params;
  if (!isTemplateKey(template)) {
    return NextResponse.json(
      { error: "Unknown template", template, valid: Object.keys(TEMPLATES) },
      { status: 400 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const periodStart = sp.get("periodStart");
  const periodEnd = sp.get("periodEnd");
  if (!periodStart || !periodEnd || !ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    return NextResponse.json(
      { error: "periodStart and periodEnd are required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (periodStart > periodEnd) {
    return NextResponse.json({ error: "periodStart must be on or before periodEnd" }, { status: 400 });
  }

  const admin = createAdminClient();

  let data: Json | null = null;
  let error: { message: string } | null = null;

  if (template === "retention") {
    const priorStartParam = sp.get("priorPeriodStart");
    const priorEndParam = sp.get("priorPeriodEnd");
    let priorStart: string;
    let priorEnd: string;
    if (priorStartParam && priorEndParam) {
      if (!ISO_DATE.test(priorStartParam) || !ISO_DATE.test(priorEndParam)) {
        return NextResponse.json({ error: "Invalid priorPeriod dates" }, { status: 400 });
      }
      priorStart = priorStartParam;
      priorEnd = priorEndParam;
    } else {
      const prior = priorPeriod(periodStart, periodEnd);
      priorStart = prior.start;
      priorEnd = prior.end;
    }
    const res = await admin.rpc("report_retention_rate", {
      p_org_id: auth.orgId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_prior_period_start: priorStart,
      p_prior_period_end: priorEnd,
    });
    data = res.data as Json | null;
    error = res.error;
  } else if (template === "recapture") {
    const minYears = parseInt(sp.get("lapsedMinYears") ?? "3", 10);
    const maxYears = parseInt(sp.get("lapsedMaxYears") ?? "5", 10);
    if (!Number.isFinite(minYears) || !Number.isFinite(maxYears) || minYears < 1 || maxYears < minYears) {
      return NextResponse.json({ error: "Invalid lapsed window" }, { status: 400 });
    }
    const res = await admin.rpc("report_recapture", {
      p_org_id: auth.orgId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_lapsed_window_min_years: minYears,
      p_lapsed_window_max_years: maxYears,
    });
    data = res.data as Json | null;
    error = res.error;
  } else {
    const res = await admin.rpc(TEMPLATES[template], {
      p_org_id: auth.orgId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    data = res.data as Json | null;
    error = res.error;
  }

  if (error) {
    return NextResponse.json(
      { error: "Report query failed", details: error.message },
      { status: 500 }
    );
  }

  const csv = data ? buildCsv(template, data) : "";

  return NextResponse.json({
    template,
    periodStart,
    periodEnd,
    data,
    csv,
  });
}
