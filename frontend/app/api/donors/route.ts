import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export type DonorTag = { id: string; name: string; color: string };

export type DonorListItem = {
  id: string;
  display_name: string | null;
  total_lifetime_value: number | string | null;
  last_donation_amount: number | string | null;
  last_donation_date: string | null;
  first_donation_date: string | null;
  billing_address: string | null;
  state: string | null;
  notes: string | null;
  tags: DonorTag[];
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const tagIdsParam = searchParams.get("tagIds");
  const filterTagIds = tagIdsParam
    ? tagIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const supabase = createAdminClient();
  let query = supabase
    .from("donors")
    .select("id,display_name,total_lifetime_value,last_donation_amount,last_donation_date,billing_address,state,notes")
    .eq("org_id", auth.orgId)
    .order("total_lifetime_value", { ascending: false, nullsFirst: false });

  if (filterTagIds?.length) {
    const { data: donorIdsWithTag } = await supabase
      .from("donor_tags")
      .select("donor_id")
      .in("tag_id", filterTagIds);
    const ids = [...new Set((donorIdsWithTag ?? []).map((r) => r.donor_id))];
    if (ids.length === 0) {
      return NextResponse.json([] as DonorListItem[]);
    }
    query = query.in("id", ids);
  }

  const { data: donors, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load donors.", details: error.message },
      { status: 500 }
    );
  }

  const list = (donors ?? []) as Omit<DonorListItem, "first_donation_date" | "tags">[];
  if (list.length === 0) {
    return NextResponse.json([] as DonorListItem[]);
  }

  const donorIds = list.map((d) => d.id);
  const { data: donations } = await supabase
    .from("donations")
    .select("donor_id,date")
    .in("donor_id", donorIds);

  const firstByDonor: Record<string, string> = {};
  for (const row of donations ?? []) {
    const id = row.donor_id;
    const d = row.date;
    if (!d) continue;
    if (!firstByDonor[id] || d < firstByDonor[id]) {
      firstByDonor[id] = d;
    }
  }

  const { data: donorTagRows } = await supabase
    .from("donor_tags")
    .select("donor_id,tag_id")
    .in("donor_id", donorIds);
  const tagIds = [...new Set((donorTagRows ?? []).map((r) => r.tag_id))];
  const tagsByDonor: Record<string, DonorTag[]> = {};
  donorIds.forEach((id) => { tagsByDonor[id] = []; });
  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from("tags")
      .select("id,name,color")
      .in("id", tagIds);
    const tagMap = new Map((tags ?? []).map((t) => [t.id, { id: t.id, name: t.name, color: t.color }]));
    for (const row of donorTagRows ?? []) {
      const tag = tagMap.get(row.tag_id);
      if (tag && tagsByDonor[row.donor_id]) {
        tagsByDonor[row.donor_id].push(tag);
      }
    }
  }

  const result: DonorListItem[] = list.map((d) => ({
    ...d,
    first_donation_date: firstByDonor[d.id] ?? null,
    tags: tagsByDonor[d.id] ?? [],
  }));

  return NextResponse.json(result);
}

