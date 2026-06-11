"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserOrg } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { ABSOLUTE_DONOR_CEILING, getOrgSubscription, resolveTrialLimits } from "@/lib/subscription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportRow = {
  display_name: string;
  external_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  donor_type?: string | null;
  amount?: number | null;
  date?: string | null;
  payment_method?: string | null;
  memo?: string | null;
};

export type ImportResult = {
  donorsCreated: number;
  donorsUpdated: number;
  donationsCreated: number;
  donorsSkipped: number;
  capReached: boolean;
  planMaxDonors: number;
  errors: Array<{ row: number; message: string }>;
};

const VALID_DONOR_TYPES = ["individual", "corporate", "school", "church"];
const VALID_PAYMENT_METHODS = [
  "check",
  "cash",
  "zelle",
  "wire",
  "venmo",
  "other",
  "daf",
];

// Chunk size for bulk inserts. Supabase accepts large arrays, but smaller
// chunks give us per-chunk error isolation without blowing up timeouts.
const INSERT_CHUNK = 500;
// Cap concurrent geocode requests to avoid hammering Mapbox (free tier is
// ~600/min; 10 in flight keeps us well under that while parallelizing).
const GEOCODE_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Main import action
// ---------------------------------------------------------------------------

export async function importDonorsFromCSV(
  rows: ImportRow[]
): Promise<ImportResult> {
  const org = await getCurrentUserOrg();
  if (!org) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const orgId = org.orgId;

  const result: ImportResult = {
    donorsCreated: 0,
    donorsUpdated: 0,
    donationsCreated: 0,
    donorsSkipped: 0,
    capReached: false,
    planMaxDonors: 0,
    errors: [],
  };

  // Pre-load existing donors for duplicate matching. Priority: external_id
  // (stable key from a previous CRM), then display_name + email.
  const { data: existingDonors } = await supabase
    .from("donors")
    .select("id, display_name, email, external_id")
    .eq("org_id", orgId);

  const existingMap = new Map<string, string>();
  for (const d of (existingDonors ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
    external_id: string | null;
  }[]) {
    if (d.external_id) {
      existingMap.set(buildExternalIdKey(d.external_id), d.id);
    }
    if (d.display_name) {
      existingMap.set(buildMatchKey(d.display_name, d.email), d.id);
    }
  }

  const sub = await getOrgSubscription(orgId);
  const plan = resolveTrialLimits(sub.planId, sub.trialTier);
  const currentDonorCount = existingDonors?.length ?? 0;
  const effectiveCap = plan.maxDonors === 0 ? ABSOLUTE_DONOR_CEILING : Math.min(plan.maxDonors, ABSOLUTE_DONOR_CEILING);
  const donorSlotsRemaining = Math.max(0, effectiveCap - currentDonorCount);
  result.planMaxDonors = effectiveCap;

  // -----------------------------------------------------------------------
  // Phase 1: Validate rows + collect unique addresses for geocoding
  // -----------------------------------------------------------------------

  type Prepared = {
    rowIdx: number;
    matchKey: string;
    existingDonorId: string | null;
    fullAddress: string | null;
    donorPayload: Record<string, unknown>;
    donation: {
      amount: number;
      date: string;
      paymentMethod: string;
      memo: string | null;
    } | null;
  };

  const prepared: Prepared[] = [];
  const addressSet = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.display_name?.trim()) {
      result.errors.push({ row: i + 1, message: "Missing display name" });
      continue;
    }

    const displayName = row.display_name.trim();
    const email = row.email?.trim() || null;
    const externalId = row.external_id?.trim() || null;
    const matchKey = buildMatchKey(displayName, email);
    // Match by external_id first when present — it survives name/email edits
    const existingId =
      (externalId ? existingMap.get(buildExternalIdKey(externalId)) : undefined) ??
      existingMap.get(matchKey) ??
      null;

    const donorType = row.donor_type?.trim().toLowerCase();
    const billingAddress = row.billing_address?.trim() || null;
    const fullAddress = billingAddress
      ? [billingAddress, row.city?.trim(), row.state?.trim(), row.zip?.trim()]
          .filter(Boolean)
          .join(", ")
      : null;

    if (fullAddress) addressSet.add(fullAddress);

    const donorPayload: Record<string, unknown> = {
      org_id: orgId,
      display_name: displayName,
      // Only set when provided — a re-import without the column must not
      // wipe external_ids already on file.
      ...(externalId ? { external_id: externalId } : {}),
      first_name: row.first_name?.trim() || null,
      last_name: row.last_name?.trim() || null,
      email,
      phone: row.phone?.trim() || null,
      billing_address: billingAddress,
      city: row.city?.trim() || null,
      state: row.state?.trim() || null,
      zip: row.zip?.trim() || null,
      donor_type:
        donorType && VALID_DONOR_TYPES.includes(donorType) ? donorType : "individual",
    };

    let donation: Prepared["donation"] = null;
    if (row.amount != null && row.amount > 0 && row.date) {
      const paymentMethod = row.payment_method?.trim().toLowerCase();
      donation = {
        amount: row.amount,
        date: row.date,
        paymentMethod:
          paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod)
            ? paymentMethod
            : "other",
        memo: row.memo?.trim() || null,
      };
    }

    prepared.push({
      rowIdx: i,
      matchKey,
      existingDonorId: existingId,
      fullAddress,
      donorPayload,
      donation,
    });
  }

  // -----------------------------------------------------------------------
  // Phase 2: Parallel geocode unique addresses
  // -----------------------------------------------------------------------

  const addresses = Array.from(addressSet);
  const geocodeResults = new Map<string, { lat: number; lng: number } | null>();

  for (let i = 0; i < addresses.length; i += GEOCODE_CONCURRENCY) {
    const batch = addresses.slice(i, i + GEOCODE_CONCURRENCY);
    const coords = await Promise.all(batch.map((addr) => geocodeAddress(addr)));
    batch.forEach((addr, j) => geocodeResults.set(addr, coords[j] ?? null));
  }

  for (const p of prepared) {
    if (p.fullAddress) {
      const c = geocodeResults.get(p.fullAddress);
      if (c) {
        p.donorPayload.location_lat = c.lat;
        p.donorPayload.location_lng = c.lng;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3: Bulk create new donors (respecting plan cap)
  // -----------------------------------------------------------------------

  const toCreate: Prepared[] = [];
  const toUpdate: Prepared[] = [];
  let newDonorsPlanned = 0;

  for (const p of prepared) {
    if (p.existingDonorId) {
      toUpdate.push(p);
      continue;
    }
    if (newDonorsPlanned >= donorSlotsRemaining) {
      result.donorsSkipped++;
      result.capReached = true;
      continue;
    }
    toCreate.push(p);
    newDonorsPlanned++;
  }

  // Bulk insert new donors in chunks. Supabase returns rows in the same order
  // as provided, so we can zip back by index to capture new IDs.
  for (let i = 0; i < toCreate.length; i += INSERT_CHUNK) {
    const chunk = toCreate.slice(i, i + INSERT_CHUNK);
    const { data: inserted, error } = await supabase
      .from("donors")
      .insert(chunk.map((p) => p.donorPayload))
      .select("id");

    if (error) {
      for (const p of chunk) {
        result.errors.push({
          row: p.rowIdx + 1,
          message: `Failed to create donor: ${error.message}`,
        });
      }
      continue;
    }

    const insertedRows = (inserted ?? []) as { id: string }[];
    chunk.forEach((p, j) => {
      const newId = insertedRows[j]?.id;
      if (!newId) return;
      p.existingDonorId = newId;
      existingMap.set(p.matchKey, newId);
      const ext = p.donorPayload.external_id as string | undefined;
      if (ext) existingMap.set(buildExternalIdKey(ext), newId);
      result.donorsCreated++;
    });
  }

  // -----------------------------------------------------------------------
  // Phase 4: Update existing donors (per-row; rare in fresh imports)
  // -----------------------------------------------------------------------

  for (const p of toUpdate) {
    const { error } = await supabase
      .from("donors")
      .update(p.donorPayload)
      .eq("id", p.existingDonorId!);
    if (error) {
      result.errors.push({
        row: p.rowIdx + 1,
        message: `Failed to update donor: ${error.message}`,
      });
      continue;
    }
    result.donorsUpdated++;
  }

  // -----------------------------------------------------------------------
  // Phase 5: Bulk insert donations
  // -----------------------------------------------------------------------

  type DonationInsert = {
    org_id: string;
    donor_id: string;
    amount: number;
    date: string;
    payment_method: string;
    memo: string | null;
    source: string;
  };

  const donationInserts: DonationInsert[] = [];
  const rowByDonation: number[] = [];
  const donorIdsWithDonations = new Set<string>();

  for (const p of prepared) {
    if (!p.donation || !p.existingDonorId) continue;
    donationInserts.push({
      org_id: orgId,
      donor_id: p.existingDonorId,
      amount: p.donation.amount,
      date: p.donation.date,
      payment_method: p.donation.paymentMethod,
      memo: p.donation.memo,
      source: "csv_import",
    });
    rowByDonation.push(p.rowIdx);
    donorIdsWithDonations.add(p.existingDonorId);
  }

  for (let i = 0; i < donationInserts.length; i += INSERT_CHUNK) {
    const chunk = donationInserts.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from("donations").insert(chunk);
    if (error) {
      for (let j = 0; j < chunk.length; j++) {
        result.errors.push({
          row: rowByDonation[i + j] + 1,
          message: `Donor created but donation failed: ${error.message}`,
        });
      }
      continue;
    }
    result.donationsCreated += chunk.length;
  }

  // -----------------------------------------------------------------------
  // Phase 6: Batched recalc of donor totals
  // -----------------------------------------------------------------------

  await batchRecalcDonorTotals(supabase, orgId, Array.from(donorIdsWithDonations));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/donations");

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMatchKey(
  displayName: string,
  email: string | null | undefined
): string {
  const name = displayName.toLowerCase().trim();
  const e = email?.toLowerCase().trim() ?? "";
  return `${name}::${e}`;
}

/** Namespaced so an external_id can never collide with a name::email key. */
function buildExternalIdKey(externalId: string): string {
  return `ext::${externalId.toLowerCase().trim()}`;
}

// ---------------------------------------------------------------------------
// Donations-history import
// ---------------------------------------------------------------------------
//
// Migration path for orgs bringing full gift history from another CRM
// (e.g. Bloomerang): one row per donation, matched to EXISTING donors by
// external_id → email → display_name + email. Unmatched rows are reported,
// never auto-created — a typo'd donor name should surface as an error, not
// silently become a duplicate donor.

export type DonationImportRow = {
  external_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  amount: number;
  date: string; // YYYY-MM-DD
  payment_method?: string | null;
  memo?: string | null;
  category?: string | null;
  campaign?: string | null;
  fund?: string | null;
};

export type DonationImportResult = {
  donationsCreated: number;
  rowsSkipped: number;
  errors: Array<{ row: number; message: string }>;
};

export async function importDonationsFromCSV(
  rows: DonationImportRow[]
): Promise<DonationImportResult> {
  const org = await getCurrentUserOrg();
  if (!org) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const orgId = org.orgId;

  const result: DonationImportResult = {
    donationsCreated: 0,
    rowsSkipped: 0,
    errors: [],
  };

  // --- Load donors for matching ---
  const { data: existingDonors } = await supabase
    .from("donors")
    .select("id, display_name, email, external_id")
    .eq("org_id", orgId);

  const byExternalId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byNameEmail = new Map<string, string>();
  for (const d of (existingDonors ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
    external_id: string | null;
  }[]) {
    if (d.external_id) byExternalId.set(d.external_id.toLowerCase().trim(), d.id);
    if (d.email) {
      const e = d.email.toLowerCase().trim();
      // Email must be unambiguous: two donors sharing an email (household)
      // means email alone can't identify either — mark and skip later.
      byEmail.set(e, byEmail.has(e) ? "__ambiguous__" : d.id);
    }
    if (d.display_name) byNameEmail.set(buildMatchKey(d.display_name, d.email), d.id);
  }

  // --- Load org donation options for name → id resolution ---
  const { data: options } = await supabase
    .from("org_donation_options")
    .select("id, type, name")
    .eq("org_id", orgId);

  const optionId = (type: string, name: string | null | undefined): string | null => {
    const n = name?.toLowerCase().trim();
    if (!n) return null;
    const hit = (options ?? []).find(
      (o) => o.type === type && (o.name as string).toLowerCase().trim() === n
    );
    return hit ? (hit.id as string) : null;
  };

  // --- Validate + match rows ---
  type DonationInsert = {
    org_id: string;
    donor_id: string;
    amount: number;
    date: string;
    payment_method: string;
    memo: string | null;
    category_id: string | null;
    campaign_id: string | null;
    fund_id: string | null;
    source: string;
  };

  const inserts: DonationInsert[] = [];
  const rowByInsert: number[] = [];
  const donorIdsWithDonations = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      result.errors.push({ row: i + 1, message: "Amount must be a positive number" });
      result.rowsSkipped++;
      continue;
    }
    const dateStr = row.date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      result.errors.push({ row: i + 1, message: "Date must be in YYYY-MM-DD format" });
      result.rowsSkipped++;
      continue;
    }

    // Match donor: external_id → email → name+email
    const ext = row.external_id?.toLowerCase().trim();
    const email = row.email?.toLowerCase().trim();
    const name = row.display_name?.trim();
    let donorId: string | null = null;
    if (ext) donorId = byExternalId.get(ext) ?? null;
    if (!donorId && email) {
      const hit = byEmail.get(email);
      donorId = hit && hit !== "__ambiguous__" ? hit : null;
    }
    if (!donorId && name) {
      donorId = byNameEmail.get(buildMatchKey(name, email ?? null)) ?? null;
    }

    if (!donorId) {
      const identifier = ext ?? email ?? name ?? "(no identifier)";
      result.errors.push({
        row: i + 1,
        message: `No matching donor found for "${identifier}" — import donors first or fix the identifier`,
      });
      result.rowsSkipped++;
      continue;
    }

    const paymentMethod = row.payment_method?.trim().toLowerCase();
    inserts.push({
      org_id: orgId,
      donor_id: donorId,
      amount,
      date: dateStr,
      payment_method:
        paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod)
          ? paymentMethod
          : "other",
      memo: row.memo?.trim() || null,
      category_id: optionId("category", row.category),
      campaign_id: optionId("campaign", row.campaign),
      fund_id: optionId("fund", row.fund),
      source: "csv_import",
    });
    rowByInsert.push(i);
    donorIdsWithDonations.add(donorId);
  }

  // --- Chunked insert ---
  for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
    const chunk = inserts.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from("donations").insert(chunk);
    if (error) {
      for (let j = 0; j < chunk.length; j++) {
        result.errors.push({
          row: rowByInsert[i + j] + 1,
          message: `Donation insert failed: ${error.message}`,
        });
      }
      result.rowsSkipped += chunk.length;
      continue;
    }
    result.donationsCreated += chunk.length;
  }

  // --- Recalc totals for affected donors ---
  await batchRecalcDonorTotals(supabase, orgId, Array.from(donorIdsWithDonations));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/donations");

  return result;
}

/**
 * Compute each donor's total_lifetime_value, last_donation_date, and
 * last_donation_amount in one pass from a single query, then write updates
 * one-per-donor (Supabase's JS client doesn't support batched UPDATE…FROM
 * across different target values). This is still dramatically faster than
 * the previous pattern of N selects + N updates because we save the N reads.
 */
async function batchRecalcDonorTotals(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  donorIds: string[]
): Promise<void> {
  if (donorIds.length === 0) return;

  const { data: donations } = await supabase
    .from("donations")
    .select("donor_id,amount,date")
    .eq("org_id", orgId)
    .in("donor_id", donorIds)
    .order("date", { ascending: false });

  const agg = new Map<
    string,
    { total: number; lastDate: string | null; lastAmount: number | null }
  >();

  for (const d of (donations ?? []) as {
    donor_id: string;
    amount: number | string | null;
    date: string | null;
  }[]) {
    const cur = agg.get(d.donor_id) ?? { total: 0, lastDate: null, lastAmount: null };
    cur.total += Number(d.amount ?? 0);
    // donations are ordered desc by date, so the first row per donor is the latest
    if (cur.lastDate === null) {
      cur.lastDate = d.date;
      cur.lastAmount = d.amount == null ? null : Number(d.amount);
    }
    agg.set(d.donor_id, cur);
  }

  await Promise.all(
    Array.from(agg.entries()).map(([donorId, a]) =>
      supabase
        .from("donors")
        .update({
          total_lifetime_value: a.total,
          last_donation_date: a.lastDate,
          last_donation_amount: a.lastAmount,
        })
        .eq("id", donorId)
    )
  );
}
