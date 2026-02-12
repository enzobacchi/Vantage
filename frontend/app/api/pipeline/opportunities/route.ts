import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = [
  "identified",
  "qualified",
  "solicited",
  "committed",
  "closed_won",
  "closed_lost",
] as const;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  let body: {
    donor_id?: string;
    title?: string;
    amount?: number;
    status?: string;
    expected_date?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const donorId = typeof body.donor_id === "string" ? body.donor_id.trim() : "";
  const amount = Number(body.amount);
  if (!donorId || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "donor_id and a valid amount are required" },
      { status: 400 }
    );
  }

  const status = VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])
    ? (body.status as (typeof VALID_STATUSES)[number])
    : "identified";
  const title = (typeof body.title === "string" ? body.title.trim() : "") || "Opportunity";
  const expectedDate = body.expected_date === undefined || body.expected_date === null
    ? null
    : (typeof body.expected_date === "string" ? body.expected_date.trim() : null) || null;

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("opportunities")
    .insert({
      organization_id: auth.orgId,
      donor_id: donorId,
      title,
      amount,
      status,
      expected_date: expectedDate,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  if (!row?.id) {
    return NextResponse.json(
      { error: "Failed to create opportunity" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: row.id });
}
