import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CrmCriteria = {
  source?: string;
  search?: string;
  tagIds?: string[];
  lifecycleConfig?: Record<string, unknown>;
  selectedColumns?: string[];
};

type DonorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  total_lifetime_value: number | string | null;
  last_donation_amount: number | string | null;
  last_donation_date: string | null;
};

const COLUMN_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  display_name: "Display Name",
  email: "Email",
  phone: "Phone",
  street_address: "Street",
  city: "City",
  state: "State",
  zip: "Zip",
  mailing_street: "Mailing Street",
  mailing_city: "Mailing City",
  mailing_state: "Mailing State",
  mailing_zip: "Mailing Zip",
  lifetime_value: "Lifetime Value",
  last_gift_date: "Last Gift Date",
  last_gift_amount: "Last Gift Amount",
};

const DEFAULT_COLUMNS = ["first_name", "last_name", "email", "lifetime_value"];

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function getDonorCellValue(d: DonorRow, columnId: string): string | number | null {
  switch (columnId) {
    case "first_name":
      return d.first_name ?? "";
    case "last_name":
      return d.last_name ?? "";
    case "display_name":
      return d.display_name ?? "";
    case "email":
      return d.email ?? "";
    case "phone":
      return d.phone ?? "";
    case "street_address":
      return d.billing_address ?? "";
    case "city":
      return d.city ?? "";
    case "state":
      return d.state ?? "";
    case "zip":
      return d.zip ?? "";
    case "mailing_street":
      return d.mailing_address ?? "";
    case "mailing_city":
      return d.mailing_city ?? "";
    case "mailing_state":
      return d.mailing_state ?? "";
    case "mailing_zip":
      return d.mailing_zip ?? "";
    case "lifetime_value":
      return d.total_lifetime_value != null ? String(d.total_lifetime_value) : "";
    case "last_gift_date":
      return d.last_donation_date ?? "";
    case "last_gift_amount":
      return d.last_donation_amount != null ? String(d.last_donation_amount) : "";
    default:
      return "";
  }
}

async function generateCrmReportContent(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  criteria: CrmCriteria
): Promise<string> {
  const filterTagIds = criteria.tagIds?.length ? criteria.tagIds : null;
  const search = (criteria.search ?? "").trim().toLowerCase();
  const selectedColumns = criteria.selectedColumns?.length ? criteria.selectedColumns : DEFAULT_COLUMNS;

  let query = supabase
    .from("donors")
    .select("id,first_name,last_name,display_name,email,phone,billing_address,city,state,zip,mailing_address,mailing_city,mailing_state,mailing_zip,total_lifetime_value,last_donation_amount,last_donation_date")
    .eq("org_id", orgId)
    .order("total_lifetime_value", { ascending: false, nullsFirst: false });

  if (filterTagIds?.length) {
    const { data: donorIdsWithTag } = await supabase
      .from("donor_tags")
      .select("donor_id")
      .in("tag_id", filterTagIds);
    const ids = [...new Set((donorIdsWithTag ?? []).map((r: { donor_id: string }) => r.donor_id))];
    if (ids.length === 0) {
      const header = selectedColumns.map((c) => COLUMN_LABELS[c] ?? c).join(",");
      return header + "\n";
    }
    query = query.in("id", ids);
  }

  const { data: donors, error } = await query;
  if (error) throw new Error(error.message);

  let list = (donors ?? []) as DonorRow[];

  if (search) {
    list = list.filter((d) => (d.display_name ?? "").toLowerCase().includes(search));
  }

  const header = selectedColumns.map((c) => COLUMN_LABELS[c] ?? c).join(",");
  const rows = list.map((d) =>
    selectedColumns.map((col) => escapeCsvCell(getDonorCellValue(d, col))).join(",")
  );
  return [header, ...rows].join("\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  }

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,type,content,summary,created_at,organization_id,query,filter_criteria,created_by_user_id,visibility")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[reports/[id]] GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load report." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const orgId = row?.organization_id;
  if (orgId != null && orgId !== auth.orgId) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  let content = typeof row?.content === "string" ? row.content : "";
  const reportType = (row?.type as string) ?? "";

  if (reportType.toLowerCase() === "crm" && typeof row?.query === "string" && row.query.trim()) {
    try {
      const criteria = JSON.parse(row.query) as CrmCriteria;
      content = await generateCrmReportContent(supabase, auth.orgId, criteria);
    } catch (e) {
      console.error("[reports] CRM content generation failed:", e instanceof Error ? e.message : String(e));
      content = "Display Name,Email,Phone,Last Gift Date,Lifetime Value,Address\n(Unable to generate report. Criteria may be invalid.)";
    }
  }

  const criteria = row?.filter_criteria as Record<string, unknown> | null | undefined;
  if (!content && criteria && typeof criteria.content === "string") {
    content = criteria.content;
  }

  // Count data rows (exclude header) so the UI can show a live row count
  const records_count = content
    ? Math.max(0, content.split("\n").filter((l) => l.trim()).length - 1)
    : 0;

  const reportParams =
    criteria && criteria.reportSource === "generate"
      ? {
          filters: (criteria.filters as Array<{ id: string; field: string; operator: string; value: unknown; value2?: unknown }>) ?? [],
          selectedColumns: (criteria.selectedColumns as string[]) ?? [],
          visibility: (criteria.visibility as string) ?? "private",
        }
      : null;

  const createdBy = (row?.created_by_user_id as string | null | undefined) ?? null;

  const { data: shareRows } = await supabase
    .from("report_shares")
    .select("user_id")
    .eq("report_id", id);

  const shareUserIds = (shareRows ?? []).map((r) => r.user_id as string);
  const userIds = new Set<string>(shareUserIds);
  if (createdBy) userIds.add(createdBy);

  const userRefs = new Map<string, { user_id: string; full_name: string | null }>();
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

  return NextResponse.json({
    id: row.id,
    title: row.title,
    type: row.type ?? null,
    summary: row.summary ?? null,
    created_at: row.created_at,
    content,
    records_count,
    reportParams,
    created_by_user_id: createdBy,
    visibility: (row?.visibility as string | null | undefined) ?? null,
    creator: createdBy
      ? userRefs.get(createdBy) ?? { user_id: createdBy, full_name: null }
      : null,
    shares: shareUserIds.map(
      (uid) => userRefs.get(uid) ?? { user_id: uid, full_name: null }
    ),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Missing title." }, { status: 400 });

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_reports")
    .update({ title })
    .eq("id", id)
    .eq("organization_id", auth.orgId)
    .select("id,title,type,summary,created_at")
    .single();

  if (error) {
    console.error("[reports/[id]] PATCH:", error.message);
    return NextResponse.json(
      { error: "Failed to rename report." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, report: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing report id." }, { status: 400 });

  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("saved_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", auth.orgId);

  if (error) {
    console.error("[reports/[id]] DELETE:", error.message);
    return NextResponse.json(
      { error: "Failed to delete report." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

