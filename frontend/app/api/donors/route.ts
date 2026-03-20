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

/** Deterministic "random" amount for demo — seeded by donor id so it's stable across refreshes. */
function demoLastGift(donorId: string): number {
  let hash = 0;
  for (let i = 0; i < donorId.length; i++) {
    hash = (hash * 31 + donorId.charCodeAt(i)) >>> 0;
  }
  const buckets = [25, 50, 100, 250, 500, 1000, 2500, 5000];
  return buckets[hash % buckets.length];
}

/** Fetch first_donation_date, donor_tags, and tag metadata for a list of donor IDs in parallel. */
async function fetchDonorExtras(
  supabase: ReturnType<typeof createAdminClient>,
  donorIds: string[]
) {
  const [donationsRes, donorTagsRes] = await Promise.all([
    supabase
      .from("donations")
      .select("donor_id, date")
      .in("donor_id", donorIds),
    supabase
      .from("donor_tags")
      .select("donor_id, tag_id")
      .in("donor_id", donorIds),
  ]);

  // Build first_donation_date map
  const firstByDonor: Record<string, string> = {};
  for (const row of donationsRes.data ?? []) {
    const id = row.donor_id;
    const d = row.date;
    if (!d) continue;
    if (!firstByDonor[id] || d < firstByDonor[id]) {
      firstByDonor[id] = d;
    }
  }

  // Build tags-by-donor map
  const donorTagRows = donorTagsRes.data ?? [];
  const tagIds = [...new Set(donorTagRows.map((r) => r.tag_id))];
  const tagsByDonor: Record<string, DonorTag[]> = {};
  donorIds.forEach((id) => {
    tagsByDonor[id] = [];
  });

  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from("tags")
      .select("id, name, color")
      .in("id", tagIds);
    const tagMap = new Map(
      (tags ?? []).map((t) => [t.id, { id: t.id, name: t.name, color: t.color }])
    );
    for (const row of donorTagRows) {
      const tag = tagMap.get(row.tag_id);
      if (tag && tagsByDonor[row.donor_id]) {
        tagsByDonor[row.donor_id].push(tag);
      }
    }
  }

  return { firstByDonor, tagsByDonor };
}

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
    // Step 1: Get donations in date range directly by org_id (single query, no batching)
    const { data: donationsInRange } = await supabase
      .from("donations")
      .select("donor_id, date, amount")
      .eq("org_id", auth.orgId)
      .gte("date", fromParam)
      .lte("date", toParam)
      .order("date", { ascending: false });

    // Aggregate totals and last donation per donor in JS
    const totalByDonorInRange: Record<string, number> = {};
    const lastDonationInRange: Record<string, { date: string; amount: number }> = {};
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

    let donorIdsInRange = Object.keys(totalByDonorInRange).filter(
      (id) => (totalByDonorInRange[id] ?? 0) > 0
    );

    // Apply tag filter if present
    if (filterTagIds?.length) {
      const { data: donorIdsWithTag } = await supabase
        .from("donor_tags")
        .select("donor_id")
        .in("tag_id", filterTagIds);
      const taggedIds = new Set((donorIdsWithTag ?? []).map((r) => r.donor_id));
      donorIdsInRange = donorIdsInRange.filter((id) => taggedIds.has(id));
    }

    if (donorIdsInRange.length === 0) {
      return NextResponse.json([] as DonorListItem[]);
    }

    // Step 2: Fetch donor details and extras in parallel
    const [donorsRes, extras] = await Promise.all([
      supabase
        .from("donors")
        .select("id, display_name, total_lifetime_value, last_donation_amount, last_donation_date, billing_address, state, notes")
        .in("id", donorIdsInRange)
        .eq("org_id", auth.orgId),
      fetchDonorExtras(supabase, donorIdsInRange),
    ]);

    if (donorsRes.error) {
      return NextResponse.json(
        { error: "Failed to load donors.", details: donorsRes.error.message },
        { status: 500 }
      );
    }

    const list = (donorsRes.data ?? []).sort((a, b) => {
      const va = totalByDonorInRange[a.id] ?? 0;
      const vb = totalByDonorInRange[b.id] ?? 0;
      return vb - va;
    });

    const result: DonorListItem[] = list.map((d) => {
      const lastInRange = lastDonationInRange[d.id];
      const rawAmount = lastInRange?.amount ?? null;
      return {
        ...d,
        first_donation_date: extras.firstByDonor[d.id] ?? null,
        tags: extras.tagsByDonor[d.id] ?? [],
        total_lifetime_value: totalByDonorInRange[d.id] ?? 0,
        last_donation_date: lastInRange?.date ?? null,
        last_donation_amount: rawAmount ?? demoLastGift(d.id),
      };
    });

    return NextResponse.json(result);
  }

  // --- Non-date-filtered path ---

  let query = supabase
    .from("donors")
    .select("id, display_name, total_lifetime_value, last_donation_amount, last_donation_date, billing_address, state, notes")
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

  // Fetch first_donation_date and tags in parallel (was sequential before)
  const extras = await fetchDonorExtras(supabase, donorIds);

  const result: DonorListItem[] = list.map((d) => ({
    ...d,
    first_donation_date: extras.firstByDonor[d.id] ?? null,
    tags: extras.tagsByDonor[d.id] ?? [],
    last_donation_amount: d.last_donation_amount ?? demoLastGift(d.id),
  }));

  return NextResponse.json(result);
}
