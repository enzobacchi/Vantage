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
  const fromParam = searchParams.get("from")?.trim() ?? "";
  const toParam = searchParams.get("to")?.trim() ?? "";
  const dateFilterActive =
    fromParam !== "" &&
    toParam !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(fromParam) &&
    /^\d{4}-\d{2}-\d{2}$/.test(toParam) &&
    fromParam <= toParam;

  const supabase = createAdminClient();

  if (dateFilterActive) {
    const { data: orgDonorRows } = await supabase
      .from("donors")
      .select("id")
      .eq("org_id", auth.orgId);
    let orgDonorIds = (orgDonorRows ?? []).map((r) => r.id);
    if (filterTagIds?.length) {
      const { data: donorIdsWithTag } = await supabase
        .from("donor_tags")
        .select("donor_id")
        .in("tag_id", filterTagIds);
      const taggedIds = new Set((donorIdsWithTag ?? []).map((r) => r.donor_id));
      orgDonorIds = orgDonorIds.filter((id) => taggedIds.has(id));
      if (orgDonorIds.length === 0) {
        return NextResponse.json([] as DonorListItem[]);
      }
    }

    const DONOR_BATCH_SIZE = 100;
    const totalByDonorInRange: Record<string, number> = {};
    const lastDonationInRange: Record<string, { date: string; amount: number }> = {};
    for (let i = 0; i < orgDonorIds.length; i += DONOR_BATCH_SIZE) {
      const batch = orgDonorIds.slice(i, i + DONOR_BATCH_SIZE);
      const { data: donationsInRange } = await supabase
        .from("donations")
        .select("donor_id,date,amount")
        .in("donor_id", batch)
        .gte("date", fromParam)
        .lte("date", toParam)
        .order("date", { ascending: false });
      for (const row of donationsInRange ?? []) {
        const id = row.donor_id;
        const amt = row.amount != null ? Number(row.amount) : 0;
        const dateStr = row.date != null ? String(row.date).slice(0, 10) : null;
        if (!dateStr) continue;
        totalByDonorInRange[id] = (totalByDonorInRange[id] ?? 0) + (Number.isFinite(amt) ? amt : 0);
        const cur = lastDonationInRange[id];
        if (!cur || dateStr > cur.date) {
          lastDonationInRange[id] = { date: dateStr, amount: Number.isFinite(amt) ? amt : 0 };
        }
      }
    }

    const donorIdsInRange = Object.keys(totalByDonorInRange).filter(
      (id) => (totalByDonorInRange[id] ?? 0) > 0
    );
    if (donorIdsInRange.length === 0) {
      return NextResponse.json([] as DonorListItem[]);
    }

    const allDonors: Omit<DonorListItem, "first_donation_date" | "tags">[] = [];
    for (let i = 0; i < donorIdsInRange.length; i += DONOR_BATCH_SIZE) {
      const batch = donorIdsInRange.slice(i, i + DONOR_BATCH_SIZE);
      const { data: batchDonors, error } = await supabase
        .from("donors")
        .select("id,display_name,total_lifetime_value,last_donation_amount,last_donation_date,billing_address,state,notes")
        .in("id", batch)
        .eq("org_id", auth.orgId);

      if (error) {
        return NextResponse.json(
          { error: "Failed to load donors.", details: error.message },
          { status: 500 }
        );
      }
      allDonors.push(...((batchDonors ?? []) as Omit<DonorListItem, "first_donation_date" | "tags">[]));
    }
    const list = allDonors.sort((a, b) => {
      const va = totalByDonorInRange[a.id] ?? 0;
      const vb = totalByDonorInRange[b.id] ?? 0;
      return vb - va;
    });
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
    donorIds.forEach((id) => {
      tagsByDonor[id] = [];
    });
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

    const result: DonorListItem[] = list.map((d) => {
      const lastInRange = lastDonationInRange[d.id];
      return {
        ...d,
        first_donation_date: firstByDonor[d.id] ?? null,
        tags: tagsByDonor[d.id] ?? [],
        total_lifetime_value: totalByDonorInRange[d.id] ?? 0,
        last_donation_date: lastInRange?.date ?? null,
        last_donation_amount: lastInRange?.amount ?? null,
      };
    });

    return NextResponse.json(result);
  }

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
  donorIds.forEach((id) => {
    tagsByDonor[id] = [];
  });
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

