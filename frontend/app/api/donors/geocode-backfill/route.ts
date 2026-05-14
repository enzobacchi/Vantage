import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { buildAddressForGeocode, geocodeAddress } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const PAGE_SIZE = 500;
const MAX_GEOCODE_PER_REQUEST = 2000;
const CONCURRENCY = 8;

/**
 * POST: Geocode donors that have an address but no location_lat/lng.
 * Runs CONCURRENCY parallel Mapbox calls with an address-level dedup cache.
 * Returns { geocoded, failed, total, message }; if work remains, the client
 * is expected to call again.
 */
export async function POST() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const orgId = auth.orgId;

  // Load up to MAX_GEOCODE_PER_REQUEST + 1 geocodeable rows so we can detect overflow.
  // Donors without any address fields are filtered out client-side, so the raw row
  // count may exceed the geocodeable count and we must page until we either fill
  // the cap-plus-one or exhaust the table.
  const toGeocode: { id: string; address: string }[] = [];
  let offset = 0;
  while (toGeocode.length <= MAX_GEOCODE_PER_REQUEST) {
    const { data, error } = await supabase
      .from("donors")
      .select("id,billing_address,city,state,zip,location_lat,location_lng")
      .eq("org_id", orgId)
      .or("location_lat.is.null,location_lng.is.null")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[donors/geocode-backfill]", error.message);
      return NextResponse.json(
        { error: "Failed to load donors." },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as Array<{
      id: string;
      billing_address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
    }>;
    for (const row of rows) {
      const address = buildAddressForGeocode(row);
      if (address) toGeocode.push({ id: row.id, address });
      if (toGeocode.length > MAX_GEOCODE_PER_REQUEST) break;
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const hasMore = toGeocode.length > MAX_GEOCODE_PER_REQUEST;
  const work = toGeocode.slice(0, MAX_GEOCODE_PER_REQUEST);
  const geocodeCache = new Map<string, Promise<{ lat: number; lng: number } | null>>();
  let geocoded = 0;
  let failed = 0;
  let cursor = 0;

  async function processOne(): Promise<void> {
    const idx = cursor++;
    if (idx >= work.length) return;
    const { id, address } = work[idx];
    let pending = geocodeCache.get(address);
    if (!pending) {
      pending = geocodeAddress(address);
      geocodeCache.set(address, pending);
    }
    const coords = await pending;
    if (coords) {
      const { error: updateError } = await supabase
        .from("donors")
        .update({ location_lat: coords.lat, location_lng: coords.lng })
        .eq("id", id);
      if (updateError) {
        console.warn(
          `[donors/geocode-backfill] DB update failed for donor ${id}: ${updateError.message}`
        );
        failed += 1;
      } else {
        geocoded += 1;
      }
    } else {
      console.warn(`[donors/geocode-backfill] Could not geocode address: "${address}"`);
      failed += 1;
    }
    return processOne();
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, work.length) }, () =>
    processOne()
  );
  await Promise.all(workers);

  return NextResponse.json({
    geocoded,
    failed,
    total: work.length,
    hasMore,
    message: hasMore
      ? `Geocoded ${geocoded} of ${work.length}; more remaining, continuing…`
      : `Geocoded ${geocoded} donors.`,
  });
}
