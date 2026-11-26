import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const runtime = "nodejs";

export type DashboardMetrics = {
  totalDonors: number;
  totalRevenue: number;
  averageGift: number;
  ytdRevenue: number;
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

export async function GET() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  // Paged: a single select stops at 1,000 rows, which silently undercounts
  // any org larger than that.
  let donorRows: Array<{ total_lifetime_value: unknown }>;
  let ytdRows: Array<{ amount: unknown }>;
  try {
    [donorRows, ytdRows] = await Promise.all([
      fetchAllRows<{ total_lifetime_value: unknown }>((from, to) =>
        supabase
          .from("donors")
          .select("total_lifetime_value")
          .eq("org_id", auth.orgId)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<{ amount: unknown }>((from, to) =>
        supabase
          .from("donations")
          .select("amount")
          .eq("org_id", auth.orgId)
          .gte("date", yearStart)
          .order("id")
          .range(from, to)
      ),
    ]);
  } catch (e) {
    console.error("[dashboard/metrics]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to load dashboard metrics." }, { status: 500 });
  }

  const totalDonors = donorRows.length;
  const totalRevenue = donorRows.reduce((sum, row) => sum + toNumber(row.total_lifetime_value), 0);
  const averageGift = totalDonors > 0 ? totalRevenue / totalDonors : 0;
  const ytdRevenue = ytdRows.reduce((sum, row) => sum + toNumber(row.amount), 0);

  const metrics: DashboardMetrics = { totalDonors, totalRevenue, averageGift, ytdRevenue };
  return NextResponse.json(metrics);
}

