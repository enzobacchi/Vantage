import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const runtime = "nodejs";

export type DonationTrendPoint = {
  month: string; // e.g. "Jan 26"
  total: number; // USD total for month
};

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();

  // last 12 months (inclusive)
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const startIso = start.toISOString().slice(0, 10); // YYYY-MM-DD

  // Paged: a single select stops at 1,000 rows.
  let data: { amount: unknown; date: string }[];
  try {
    data = await fetchAllRows<{ amount: unknown; date: string }>((from, to) =>
      supabase
        .from("donations")
        .select("amount, date")
        .eq("org_id", auth.orgId)
        .gte("date", startIso)
        .order("id")
        .range(from, to)
    );
  } catch (e) {
    console.error("[donations/trend]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Failed to load donation trend." },
      { status: 500 }
    );
  }

  const totals = new Map<string, number>();
  for (const row of data) {
    if (typeof row?.date !== "string") continue;
    const d = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const key = monthKey(d);
    totals.set(key, (totals.get(key) ?? 0) + toNumber(row.amount));
  }

  // Ensure we return all months in range (even if $0).
  const points: DonationTrendPoint[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = monthKey(d);
    points.push({ month: monthLabel(d), total: totals.get(key) ?? 0 });
  }

  return NextResponse.json(points);
}
