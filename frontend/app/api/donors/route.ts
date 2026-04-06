import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLimitExceeded } from "@/lib/subscription";

export const runtime = "nodejs";

export type DonorTag = { id: string; name: string; color: string };

export type DonorListItem = {
  id: string;
  display_name: string | null;
  email: string | null;
  total_lifetime_value: number | string | null;
  last_donation_amount: number | string | null;
  last_donation_date: string | null;
  first_donation_date: string | null;
  billing_address: string | null;
  state: string | null;
  notes: string | null;
  tags: DonorTag[];
};

/** Valid sort options accepted via ?sort= query param. */
type SortOption = "recent" | "highest" | "lowest" | "lifetime_highest" | "lifetime_lowest";

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

export type DonorListResponse = {
  donors: DonorListItem[];
  total: number;
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

  const pageParam = parseInt(searchParams.get("page") ?? "0", 10);
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const page = Number.isFinite(pageParam) && pageParam >= 0 ? pageParam : 0;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  const searchQuery = searchParams.get("search")?.trim() ?? "";
  const sortParam = (searchParams.get("sort")?.trim() ?? "lifetime_highest") as SortOption;

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
      return NextResponse.json({ donors: [] as DonorListItem[], total: 0 } satisfies DonorListResponse);
    }

    // Step 2: Fetch donor details and extras in parallel
    const [donorsRes, extras] = await Promise.all([
      supabase
        .from("donors")
        .select("id, display_name, email, total_lifetime_value, last_donation_amount, last_donation_date, billing_address, state, notes")
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

    let sorted = (donorsRes.data ?? []).sort((a, b) => {
      if (sortParam === "recent") {
        const da = lastDonationInRange[a.id]?.date ?? "";
        const db = lastDonationInRange[b.id]?.date ?? "";
        return db.localeCompare(da);
      }
      if (sortParam === "lowest") {
        const va = lastDonationInRange[a.id]?.amount ?? null;
        const vb = lastDonationInRange[b.id]?.amount ?? null;
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return va - vb;
      }
      if (sortParam === "highest") {
        const va = lastDonationInRange[a.id]?.amount ?? null;
        const vb = lastDonationInRange[b.id]?.amount ?? null;
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      }
      if (sortParam === "lifetime_lowest") {
        const va = totalByDonorInRange[a.id] ?? 0;
        const vb = totalByDonorInRange[b.id] ?? 0;
        return va - vb;
      }
      // default: lifetime_highest
      const va = totalByDonorInRange[a.id] ?? 0;
      const vb = totalByDonorInRange[b.id] ?? 0;
      return vb - va;
    });
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter((d) => (d.display_name ?? "").toLowerCase().includes(q));
    }

    const total = sorted.length;
    const list = sorted.slice(page * limit, page * limit + limit);

    const result: DonorListItem[] = list.map((d) => {
      const lastInRange = lastDonationInRange[d.id];
      const rawAmount = lastInRange?.amount ?? null;
      return {
        ...d,
        first_donation_date: extras.firstByDonor[d.id] ?? null,
        tags: extras.tagsByDonor[d.id] ?? [],
        total_lifetime_value: totalByDonorInRange[d.id] ?? 0,
        last_donation_date: lastInRange?.date ?? null,
        last_donation_amount: rawAmount ?? null,
      };
    });

    return NextResponse.json({ donors: result, total } satisfies DonorListResponse);
  }

  // --- Non-date-filtered path ---

  let tagFilteredIds: string[] | null = null;
  if (filterTagIds?.length) {
    const { data: donorIdsWithTag } = await supabase
      .from("donor_tags")
      .select("donor_id")
      .in("tag_id", filterTagIds);
    tagFilteredIds = [...new Set((donorIdsWithTag ?? []).map((r) => r.donor_id))];
    if (tagFilteredIds.length === 0) {
      return NextResponse.json({ donors: [] as DonorListItem[], total: 0 } satisfies DonorListResponse);
    }
  }

  // Count query (exact total for pagination)
  let countQuery = supabase
    .from("donors")
    .select("id", { count: "exact", head: true })
    .eq("org_id", auth.orgId);
  if (tagFilteredIds) countQuery = countQuery.in("id", tagFilteredIds);
  if (searchQuery) countQuery = countQuery.ilike("display_name", `%${searchQuery}%`);
  const { count: totalCount } = await countQuery;
  const total = totalCount ?? 0;

  // Determine server-side sort column and direction
  let orderColumn = "total_lifetime_value";
  let ascending = false;
  if (sortParam === "recent") {
    orderColumn = "last_donation_date";
    ascending = false;
  } else if (sortParam === "highest") {
    orderColumn = "last_donation_amount";
    ascending = false;
  } else if (sortParam === "lowest") {
    orderColumn = "last_donation_amount";
    ascending = true;
  } else if (sortParam === "lifetime_lowest") {
    orderColumn = "total_lifetime_value";
    ascending = true;
  }
  // default (lifetime_highest): total_lifetime_value desc

  // Data query with offset pagination
  let query = supabase
    .from("donors")
    .select("id, display_name, email, total_lifetime_value, last_donation_amount, last_donation_date, billing_address, state, notes")
    .eq("org_id", auth.orgId)
    .order(orderColumn, { ascending, nullsFirst: false })
    .range(page * limit, page * limit + limit - 1);

  if (tagFilteredIds) query = query.in("id", tagFilteredIds);
  if (searchQuery) query = query.ilike("display_name", `%${searchQuery}%`);

  const { data: donors, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to load donors.", details: error.message },
      { status: 500 }
    );
  }

  const list = (donors ?? []) as Omit<DonorListItem, "first_donation_date" | "tags">[];
  if (list.length === 0) {
    return NextResponse.json({ donors: [] as DonorListItem[], total } satisfies DonorListResponse);
  }

  const donorIds = list.map((d) => d.id);

  const extras = await fetchDonorExtras(supabase, donorIds);

  const result: DonorListItem[] = list.map((d) => ({
    ...d,
    first_donation_date: extras.firstByDonor[d.id] ?? null,
    tags: extras.tagsByDonor[d.id] ?? [],
    last_donation_amount: d.last_donation_amount ?? null,
  }));

  return NextResponse.json({ donors: result, total } satisfies DonorListResponse);
}

const VALID_DONOR_TYPES = ["individual", "corporate", "school", "church"] as const;

export async function POST(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }

  if (await isLimitExceeded(auth.orgId, "donors")) {
    return NextResponse.json(
      { error: "Donor limit reached. Please upgrade your plan." },
      { status: 429 }
    );
  }

  const donorType = VALID_DONOR_TYPES.includes(body.donor_type) ? body.donor_type : "individual";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("donors")
    .insert({
      org_id: auth.orgId,
      display_name: displayName,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      billing_address: body.billing_address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip?.trim() || null,
      donor_type: donorType,
      total_lifetime_value: 0,
      last_donation_date: null,
      last_donation_amount: null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
