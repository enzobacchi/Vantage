import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type RecentDonation = {
  id: string;
  donor_id: string;
  donor_name: string | null;
  amount: number | null;
  date: string | null;
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type DonationRow = {
  id: string;
  donor_id: string;
  amount: unknown;
  date: string | null;
  donors?: { display_name?: string | null } | null;
};

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();

  // Single query using org_id directly — no batch loop needed
  const { data, error } = await supabase
    .from("donations")
    .select("id, donor_id, amount, date, donors(display_name)")
    .eq("org_id", auth.orgId)
    .order("date", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error("[donations/recent]", error.message);
    return NextResponse.json(
      { error: "Failed to load recent gifts." },
      { status: 500 }
    );
  }

  const result: RecentDonation[] = ((data ?? []) as DonationRow[]).map((r) => ({
    id: String(r.id),
    donor_id: String(r.donor_id),
    donor_name: typeof r?.donors?.display_name === "string" ? r.donors.display_name : null,
    amount: toNumber(r.amount),
    date: typeof r.date === "string" ? r.date : null,
  }));

  return NextResponse.json(result);
}
