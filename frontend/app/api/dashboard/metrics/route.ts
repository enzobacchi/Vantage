import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DashboardMetrics = {
  totalDonors: number;
  totalRevenue: number;
  averageGift: number;
  medianGift: number;
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
  const { data, error, count } = await supabase
    .from("donors")
    .select("total_lifetime_value", { count: "exact" })
    .eq("org_id", auth.orgId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load dashboard metrics.", details: error.message },
      { status: 500 }
    );
  }

  const totalDonors = count ?? (data?.length ?? 0);
  const values = (data ?? []).map((row) => toNumber((row as { total_lifetime_value?: unknown }).total_lifetime_value));
  const totalRevenue = values.reduce((sum, v) => sum + v, 0);
  const averageGift = totalDonors > 0 ? totalRevenue / totalDonors : 0;

  const sorted = [...values].sort((a, b) => a - b);
  const medianGift =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;

  const metrics: DashboardMetrics = { totalDonors, totalRevenue, averageGift, medianGift };
  return NextResponse.json(metrics);
}

