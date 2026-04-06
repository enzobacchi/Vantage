import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const [donorsRes, ytdRes] = await Promise.all([
    supabase
      .from("donors")
      .select("total_lifetime_value", { count: "exact" })
      .eq("org_id", auth.orgId),
    supabase
      .from("donations")
      .select("amount")
      .eq("org_id", auth.orgId)
      .gte("date", yearStart),
  ]);

  if (donorsRes.error) {
    return NextResponse.json(
      { error: "Failed to load dashboard metrics.", details: donorsRes.error.message },
      { status: 500 }
    );
  }

  const totalDonors = donorsRes.count ?? (donorsRes.data?.length ?? 0);
  const values = (donorsRes.data ?? []).map((row) => toNumber((row as { total_lifetime_value?: unknown }).total_lifetime_value));
  const totalRevenue = values.reduce((sum, v) => sum + v, 0);
  const averageGift = totalDonors > 0 ? totalRevenue / totalDonors : 0;
  const ytdRevenue = (ytdRes.data ?? []).reduce((sum, row) => sum + toNumber((row as { amount?: unknown }).amount), 0);

  const metrics: DashboardMetrics = { totalDonors, totalRevenue, averageGift, ytdRevenue };
  return NextResponse.json(metrics);
}

