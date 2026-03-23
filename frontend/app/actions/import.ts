"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserOrg } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgSubscription, PLANS } from "@/lib/subscription";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportRow = {
  display_name: string;
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
    errors: [],
  };

  // Pre-load existing donors for duplicate matching (display_name + email)
  const { data: existingDonors } = await supabase
    .from("donors")
    .select("id, display_name, email")
    .eq("org_id", orgId);

  const existingMap = new Map<string, string>();
  for (const d of (existingDonors ?? []) as {
    id: string;
    display_name: string | null;
    email: string | null;
  }[]) {
    if (d.display_name) {
      const key = buildMatchKey(d.display_name, d.email);
      existingMap.set(key, d.id);
    }
  }

  // Enforce donor limit — calculate how many new donors can still be created
  const sub = await getOrgSubscription(orgId);
  const plan = PLANS[sub.planId];
  const currentDonorCount = existingDonors?.length ?? 0;
  const donorSlotsRemaining =
    plan.maxDonors === 0 ? Infinity : Math.max(0, plan.maxDonors - currentDonorCount);
  let newDonorsCreated = 0;

  const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
  const donorIdsWithDonations: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Validate required field
    if (!row.display_name?.trim()) {
      result.errors.push({ row: i + 1, message: "Missing display name" });
      continue;
    }

    const displayName = row.display_name.trim();
    const email = row.email?.trim() || null;
    const matchKey = buildMatchKey(displayName, email);
    const existingDonorId = existingMap.get(matchKey);

    // Build donor payload
    const donorType = row.donor_type?.trim().toLowerCase();
    const billingAddress = row.billing_address?.trim() || null;
    const fullAddress = billingAddress
      ? [
          billingAddress,
          row.city?.trim(),
          row.state?.trim(),
          row.zip?.trim(),
        ]
          .filter(Boolean)
          .join(", ")
      : null;

    const donorPayload: Record<string, unknown> = {
      org_id: orgId,
      display_name: displayName,
      first_name: row.first_name?.trim() || null,
      last_name: row.last_name?.trim() || null,
      email,
      phone: row.phone?.trim() || null,
      billing_address: billingAddress,
      city: row.city?.trim() || null,
      state: row.state?.trim() || null,
      zip: row.zip?.trim() || null,
      donor_type:
        donorType && VALID_DONOR_TYPES.includes(donorType)
          ? donorType
          : "individual",
    };

    // Geocode if we have an address
    if (fullAddress) {
      let coords = geocodeCache.get(fullAddress);
      if (coords === undefined) {
        coords = await geocodeAddress(fullAddress);
        geocodeCache.set(fullAddress, coords);
      }
      if (coords) {
        donorPayload.location_lat = coords.lat;
        donorPayload.location_lng = coords.lng;
      }
    }

    let donorId: string;

    if (existingDonorId) {
      // Update existing donor
      const { error } = await supabase
        .from("donors")
        .update(donorPayload)
        .eq("id", existingDonorId);

      if (error) {
        result.errors.push({
          row: i + 1,
          message: `Failed to update donor: ${error.message}`,
        });
        continue;
      }
      donorId = existingDonorId;
      result.donorsUpdated++;
    } else {
      // Enforce donor limit before creating
      if (newDonorsCreated >= donorSlotsRemaining) {
        result.errors.push({
          row: i + 1,
          message: "Donor limit reached. Upgrade your plan to import more donors.",
        });
        continue;
      }

      // Create new donor
      const { data: newDonor, error } = await supabase
        .from("donors")
        .insert(donorPayload)
        .select("id")
        .single();

      if (error || !newDonor?.id) {
        result.errors.push({
          row: i + 1,
          message: `Failed to create donor: ${error?.message ?? "Unknown error"}`,
        });
        continue;
      }
      donorId = (newDonor as { id: string }).id;
      existingMap.set(matchKey, donorId);
      result.donorsCreated++;
      newDonorsCreated++;
    }

    // Create donation if amount and date are present
    if (row.amount != null && row.amount > 0 && row.date) {
      const paymentMethod = row.payment_method?.trim().toLowerCase();
      const { error: donationError } = await supabase
        .from("donations")
        .insert({
          org_id: orgId,
          donor_id: donorId,
          amount: row.amount,
          date: row.date,
          payment_method:
            paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod)
              ? paymentMethod
              : "other",
          memo: row.memo?.trim() || null,
          source: "csv_import",
        });

      if (donationError) {
        result.errors.push({
          row: i + 1,
          message: `Donor created but donation failed: ${donationError.message}`,
        });
      } else {
        result.donationsCreated++;
        donorIdsWithDonations.push(donorId);
      }
    }
  }

  // Recalculate totals for donors that got new donations
  const uniqueDonorIds = [...new Set(donorIdsWithDonations)];
  for (const donorId of uniqueDonorIds) {
    await recalcDonorTotals(supabase, donorId);
  }

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

async function recalcDonorTotals(
  supabase: ReturnType<typeof createAdminClient>,
  donorId: string
): Promise<void> {
  const { data: donations } = await supabase
    .from("donations")
    .select("amount,date")
    .eq("donor_id", donorId)
    .order("date", { ascending: false });

  const rows = (donations ?? []) as { amount: number; date: string }[];
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const last = rows[0];

  await supabase
    .from("donors")
    .update({
      total_lifetime_value: total,
      last_donation_date: last?.date ?? null,
      last_donation_amount: last?.amount ?? null,
    })
    .eq("id", donorId);
}
