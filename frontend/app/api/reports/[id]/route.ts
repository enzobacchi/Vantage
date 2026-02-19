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
    .select("id,first_name,last_name,display_name,email,phone,billing_address,city,state,zip,total_lifetime_value,last_donation_amount,last_donation_date")
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
    .select("id,title,type,content,summary,created_at,organization_id,query")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load report.", details: error.message },
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

  return NextResponse.json({
    id: row.id,
    title: row.title,
    type: row.type ?? null,
    summary: row.summary ?? null,
    created_at: row.created_at,
    content,
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
    return NextResponse.json(
      { error: "Failed to rename report.", details: error.message },
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
    return NextResponse.json(
      { error: "Failed to delete report.", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

