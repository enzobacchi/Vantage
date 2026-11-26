import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { readJsonObject } from "@/lib/http";
import { buildAddressForGeocode, geocodeAddress } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { isLimitExceeded } from "@/lib/subscription";

export const runtime = "nodejs";

export type DonorTag = { id: string; name: string; color: string };

export type DonorListItem = {
  id: string;
  external_id: string | null;
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
  assigned_to: string | null;
  custom_fields: Record<string, string> | null;
};

const UNASSIGNED = "unassigned";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAssigneeFilter(raw: string | null): {
  userIds: string[];
  includeUnassigned: boolean;
} | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const userIds: string[] = [];
  let includeUnassigned = false;
  for (const p of parts) {
    if (p === UNASSIGNED || p === "__unassigned__") {
      includeUnassigned = true;
    } else if (UUID_RE.test(p)) {
      // Strict UUID validation — these ids are spliced into PostgREST .or()
      // filter syntax below, so anything non-UUID is dropped to prevent
      // filter-injection (and pointless 500s on malformed input).
      userIds.push(p);
    }
  }
  if (userIds.length === 0 && !includeUnassigned) return null;
  return { userIds, includeUnassigned };
}

/** Valid sort options accepted via ?sort= query param. */
type SortOption = "recent" | "highest" | "lowest" | "lifetime_highest" | "lifetime_lowest";

/** Fetch first_donation_date, donor_tags, and tag metadata for a list of donor IDs in parallel. */
async function fetchDonorExtras(
  supabase: ReturnType<typeof createAdminClient>,
  donorIds: string[]
) {
  // Only ever called for one page of donors. Still chunked and paged: a page
  // of major donors can have more than 1,000 gifts between them.
  const [donationRows, donorTagRows] = await Promise.all([
    fetchAllByIds<{ donor_id: string; date: string | null }>(donorIds, (ids, from, to) =>
      supabase
        .from("donations")
        .select("donor_id, date")
        .in("donor_id", ids)
        .order("id")
        .range(from, to)
    ),
    fetchAllByIds<{ donor_id: string; tag_id: string }>(donorIds, (ids, from, to) =>
      supabase
        .from("donor_tags")
        .select("donor_id, tag_id")
        .in("donor_id", ids)
        .order("donor_id")
        .order("tag_id")
        .range(from, to)
    ),
  ]);

  // Build first_donation_date map
  const firstByDonor: Record<string, string> = {};
  for (const row of donationRows) {
    const id = row.donor_id;
    const d = row.date;
    if (!d) continue;
    if (!firstByDonor[id] || d < firstByDonor[id]) {
      firstByDonor[id] = d;
    }
  }

  // Build tags-by-donor map
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

/**
 * Ids of this org's donors carrying any of the given tags. Scoped to the org
 * through the donor join (a tag id alone is not an org boundary) and paged.
 */
async function fetchTaggedDonorIds(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  tagIds: string[]
): Promise<Set<string>> {
  const rows = await fetchAllRows<{ donor_id: string }>((from, to) =>
    supabase
      .from("donor_tags")
      .select("donor_id, donors!inner(org_id)")
      .eq("donors.org_id", orgId)
      .in("tag_id", tagIds)
      .order("donor_id")
      .order("tag_id")
      .range(from, to)
  );
  return new Set(rows.map((r) => r.donor_id));
}

const DONOR_COLUMNS =
  "id, external_id, display_name, email, total_lifetime_value, last_donation_amount, last_donation_date, billing_address, state, notes, assigned_to, custom_fields";

type DonorRow = Omit<DonorListItem, "first_donation_date" | "tags">;

export type DonorListResponse = {
  donors: DonorListItem[];
  total: number;
};

export async function GET(request: Request) {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;
  try {
    return await listDonors(request, auth.orgId);
  } catch (e) {
    console.error("[donors] GET:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to load donors." }, { status: 500 });
  }
}

async function listDonors(request: Request, orgId: string): Promise<NextResponse> {

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
  const assigneeFilter = parseAssigneeFilter(searchParams.get("assignedTo"));

  const supabase = createAdminClient();

  if (dateFilterActive) {
    // Step 1: every donation in the date range (paged past the 1,000-row cap)
    const donationsInRange = await fetchAllRows<{ donor_id: string; date: string | null; amount: unknown }>(
      (from, to) =>
        supabase
          .from("donations")
          .select("donor_id, date, amount")
          .eq("org_id", orgId)
          .gte("date", fromParam)
          .lte("date", toParam)
          .order("date", { ascending: false })
          .order("id")
          .range(from, to)
    );

    // Aggregate totals and last donation per donor in JS
    const totalByDonorInRange: Record<string, number> = {};
    const lastDonationInRange: Record<string, { date: string; amount: number }> = {};
    for (const row of donationsInRange) {
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
      const taggedIds = await fetchTaggedDonorIds(supabase, orgId, filterTagIds);
      donorIdsInRange = donorIdsInRange.filter((id) => taggedIds.has(id));
    }

    if (donorIdsInRange.length === 0) {
      return NextResponse.json({ donors: [] as DonorListItem[], total: 0 } satisfies DonorListResponse);
    }

    // Step 2: donor details, in id chunks (the id list can run to thousands)
    let assigneeClause: string | null = null;
    if (assigneeFilter) {
      const clauses: string[] = [];
      if (assigneeFilter.userIds.length > 0) {
        clauses.push(`assigned_to.in.(${assigneeFilter.userIds.join(",")})`);
      }
      if (assigneeFilter.includeUnassigned) clauses.push("assigned_to.is.null");
      if (clauses.length === 0) {
        return NextResponse.json({ donors: [] as DonorListItem[], total: 0 } satisfies DonorListResponse);
      }
      assigneeClause = clauses.join(",");
    }
    const donorsInRange = await fetchAllByIds<DonorRow>(donorIdsInRange, (ids, from, to) => {
      let q = supabase.from("donors").select(DONOR_COLUMNS).in("id", ids).eq("org_id", orgId);
      if (assigneeClause) q = q.or(assigneeClause);
      return q.order("id").range(from, to) as unknown as PromiseLike<{
        data: DonorRow[] | null;
        error: { message: string } | null;
      }>;
    });

    let sorted = donorsInRange.sort((a, b) => {
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
    const extras = await fetchDonorExtras(supabase, list.map((d) => d.id));

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

  // Tag filter: an inner join on donor_tags, so no donor-id list has to be
  // shipped back to the database.
  const tagFilter = filterTagIds?.length ? filterTagIds : null;

  // Count query (exact total for pagination)
  let countQuery = supabase
    .from("donors")
    .select(tagFilter ? "id, donor_tags!inner(tag_id)" : "id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (tagFilter) countQuery = countQuery.in("donor_tags.tag_id", tagFilter);
  if (searchQuery) countQuery = countQuery.ilike("display_name", `%${searchQuery}%`);
  if (assigneeFilter) {
    const clauses: string[] = [];
    if (assigneeFilter.userIds.length > 0) {
      clauses.push(`assigned_to.in.(${assigneeFilter.userIds.join(",")})`);
    }
    if (assigneeFilter.includeUnassigned) clauses.push("assigned_to.is.null");
    if (clauses.length === 0) {
      return NextResponse.json({ donors: [] as DonorListItem[], total: 0 } satisfies DonorListResponse);
    }
    countQuery = countQuery.or(clauses.join(","));
  }
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
    .select(tagFilter ? `${DONOR_COLUMNS}, donor_tags!inner(tag_id)` : DONOR_COLUMNS)
    .eq("org_id", orgId)
    .order(orderColumn, { ascending, nullsFirst: false })
    .order("id")
    .range(page * limit, page * limit + limit - 1);

  if (tagFilter) query = query.in("donor_tags.tag_id", tagFilter);
  if (searchQuery) query = query.ilike("display_name", `%${searchQuery}%`);
  if (assigneeFilter) {
    const clauses: string[] = [];
    if (assigneeFilter.userIds.length > 0) {
      clauses.push(`assigned_to.in.(${assigneeFilter.userIds.join(",")})`);
    }
    if (assigneeFilter.includeUnassigned) clauses.push("assigned_to.is.null");
    if (clauses.length > 0) query = query.or(clauses.join(","));
  }

  const { data: donors, error } = await query;

  if (error) {
    console.error("[donors] GET:", error.message);
    return NextResponse.json(
      { error: "Failed to load donors." },
      { status: 500 }
    );
  }

  const list = ((donors ?? []) as unknown as Array<DonorRow & { donor_tags?: unknown }>).map(
    ({ donor_tags: _joined, ...donor }) => donor as DonorRow
  );
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

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    display_name?: unknown;
    donor_type?: string;
    email?: string;
    phone?: string;
    billing_address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
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

  const donorType =
    typeof body.donor_type === "string" &&
    (VALID_DONOR_TYPES as readonly string[]).includes(body.donor_type)
      ? body.donor_type
      : "individual";

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
    console.error("[donors] POST:", error.message);
    return NextResponse.json({ error: "Failed to create donor." }, { status: 500 });
  }

  const address = buildAddressForGeocode({
    billing_address: body.billing_address,
    city: body.city,
    state: body.state,
    zip: body.zip,
  });
  if (address) {
    try {
      const coords = await geocodeAddress(address);
      if (coords) {
        await supabase
          .from("donors")
          .update({ location_lat: coords.lat, location_lng: coords.lng })
          .eq("id", data.id);
      }
    } catch (geoErr) {
      console.warn(
        `[donors] POST geocoding failed for donor ${data.id}: ${(geoErr as Error).message}`
      );
    }
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
