import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DashboardMetrics = {
  totalDonors: number;
  totalRevenue: number;
  averageGift: number;
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
  const totalRevenue = (data ?? []).reduce((sum, row) => sum + toNumber((row as any).total_lifetime_value), 0);
  const averageGift = totalDonors > 0 ? totalRevenue / totalDonors : 0;

  const metrics: DashboardMetrics = { totalDonors, totalRevenue, averageGift };
  return NextResponse.json(metrics);
}

