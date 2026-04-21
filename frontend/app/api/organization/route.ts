import { NextResponse } from "next/server";

import { getCurrentUserOrgWithRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type OrganizationResponse = {
  id: string;
  name: string | null;
  website_url: string | null;
  logo_url: string | null;
  tax_id: string | null;
  legal_501c3_wording: string | null;
  fiscal_year_start_month: number;
  role: "owner" | "admin" | "member";
};

export async function GET() {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,website_url,logo_url,tax_id,legal_501c3_wording,fiscal_year_start_month")
    .eq("id", ctx.orgId)
    .maybeSingle();

  if (error) {
    console.error("[organization] GET:", error.message);
    return NextResponse.json({ error: "Failed to load organization." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const org = data as {
    id: string;
    name: string | null;
    website_url: string | null;
    logo_url: string | null;
    tax_id: string | null;
    legal_501c3_wording: string | null;
    fiscal_year_start_month: number | null;
  };

  const response: OrganizationResponse = {
    id: org.id,
    name: org.name,
    website_url: org.website_url,
    logo_url: org.logo_url,
    tax_id: org.tax_id,
    legal_501c3_wording: org.legal_501c3_wording,
    fiscal_year_start_month: org.fiscal_year_start_month ?? 1,
    role: ctx.role as "owner" | "admin" | "member",
  };
  return NextResponse.json(response);
}

const EDITABLE_FIELDS = ["name", "website_url", "tax_id", "legal_501c3_wording"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function PATCH(request: Request) {
  const ctx = await getCurrentUserOrgWithRole();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "Only the organization owner can update these settings." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const update: Record<string, string | number | null> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key as EditableField];
    if (value === null || value === undefined) {
      update[key] = null;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      update[key] = trimmed.length === 0 ? null : trimmed;
    } else {
      return NextResponse.json(
        { error: `Field "${key}" must be a string or null.` },
        { status: 400 }
      );
    }
  }

  if ("fiscal_year_start_month" in body) {
    const v = body.fiscal_year_start_month;
    const month = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "fiscal_year_start_month must be an integer between 1 and 12." },
        { status: 400 }
      );
    }
    update.fiscal_year_start_month = month;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  if ("name" in update && (update.name === null || update.name === "")) {
    return NextResponse.json({ error: "Organization name cannot be empty." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", ctx.orgId);

  if (error) {
    console.error("[organization] PATCH:", error.message);
    return NextResponse.json({ error: "Failed to update organization." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
