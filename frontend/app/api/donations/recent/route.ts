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

const DONOR_ID_BATCH_SIZE = 100;

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
  const { data: orgDonors } = await supabase.from("donors").select("id").eq("org_id", auth.orgId);
  const donorIds = (orgDonors ?? []).map((d: { id: string }) => d.id);

  const idsToQuery =
    donorIds.length > 0 ? donorIds : ["00000000-0000-0000-0000-000000000000"];
  const allRows: DonationRow[] = [];

  for (let i = 0; i < idsToQuery.length; i += DONOR_ID_BATCH_SIZE) {
    const batch = idsToQuery.slice(i, i + DONOR_ID_BATCH_SIZE);
    const { data, error } = await supabase
      .from("donations")
      .select("id,donor_id,amount,date, donors(display_name)")
      .in("donor_id", batch)
      .order("date", { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load recent gifts.", details: error.message },
        { status: 500 }
      );
    }
    if (Array.isArray(data)) allRows.push(...(data as DonationRow[]));
  }

  const sorted = [...allRows].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    return db.localeCompare(da);
  });
  const rows = sorted.slice(0, 20);
  const result: RecentDonation[] = rows.map((r) => ({
    id: String(r.id),
    donor_id: String(r.donor_id),
    donor_name: typeof r?.donors?.display_name === "string" ? r.donors.display_name : null,
    amount: toNumber(r.amount),
    date: typeof r.date === "string" ? r.date : null,
  }));

  return NextResponse.json(result);
}

