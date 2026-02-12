import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DonorSearchItem = {
  id: string;
  display_name: string | null;
  total_lifetime_value: number | string | null;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json([]);
  }

  const supabase = createAdminClient();
  const pattern = `%${q}%`;

  const [nameRes, emailRes] = await Promise.all([
    supabase
      .from("donors")
      .select("id,display_name,total_lifetime_value")
      .eq("org_id", auth.orgId)
      .ilike("display_name", pattern)
      .order("total_lifetime_value", { ascending: false, nullsFirst: false })
      .limit(10),
    q.includes("@")
      ? { data: [] as DonorSearchItem[], error: null }
      : supabase
          .from("donors")
          .select("id,display_name,total_lifetime_value")
          .eq("org_id", auth.orgId)
          .ilike("email", pattern)
          .order("total_lifetime_value", { ascending: false, nullsFirst: false })
          .limit(10),
  ]);

  if (nameRes.error) {
    return NextResponse.json(
      { error: "Search failed", details: nameRes.error.message },
      { status: 500 }
    );
  }

  const byName = (nameRes.data ?? []) as DonorSearchItem[];
  const byEmail = (emailRes.error ? [] : (emailRes.data ?? [])) as DonorSearchItem[];
  const seen = new Set<string>();
  const merged: DonorSearchItem[] = [];
  for (const r of [...byName, ...byEmail]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }

  return NextResponse.json(merged.slice(0, 10));
}
