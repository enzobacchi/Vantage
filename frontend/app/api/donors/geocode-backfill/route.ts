import { NextResponse } from "next/server";

import { requireUserOrg } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120; // allow long run for many donors

const PAGE_SIZE = 500;
const MAX_GEOCODE_PER_REQUEST = 2000;
const DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address.trim()) return null;

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json`
  );
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("limit", "1");

  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = data.features?.[0]?.center;
  if (!center) return null;
  const [lng, lat] = center;
  return { lat, lng };
}

/** Build address string for geocoding: prefer billing_address, else "city, state zip". */
function buildAddressForGeocode(row: {
  billing_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const addr = row.billing_address?.trim();
  if (addr) return addr;
  const city = row.city?.trim();
  const state = row.state?.trim();
  const zip = row.zip?.trim();
  if (city && state) return [city, state, zip].filter(Boolean).join(", ");
  if (zip) return zip;
  return null;
}

/**
 * POST: Geocode donors that have an address but no location_lat/lng.
 * Processes in batches with a delay to avoid Mapbox rate limits.
 * Returns { geocoded, failed, total }.
 */
export async function POST() {
  const auth = await requireUserOrg();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const orgId = auth.orgId;

  // Collect all donor rows that need geocoding (have address, missing coords)
  const toGeocode: { id: string; address: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("donors")
      .select("id,billing_address,city,state,zip,location_lat,location_lng")
      .eq("org_id", orgId)
      .or("location_lat.is.null,location_lng.is.null")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load donors.", details: error.message },
        { status: 500 }
      );
    }
    const rows = (data ?? []) as Array<{
      id: string;
      billing_address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      location_lat?: number | null;
      location_lng?: number | null;
    }>;
    for (const row of rows) {
      const address = buildAddressForGeocode(row);
      if (address) toGeocode.push({ id: row.id, address });
    }
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (toGeocode.length >= MAX_GEOCODE_PER_REQUEST) break;
  }

  const cap = Math.min(toGeocode.length, MAX_GEOCODE_PER_REQUEST);
  let geocoded = 0;
  let failed = 0;
  const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

  for (let i = 0; i < cap; i++) {
    const { id, address } = toGeocode[i];
    let coords = geocodeCache.get(address);
    if (coords === undefined) {
      await sleep(DELAY_MS);
      coords = await geocodeAddress(address);
      geocodeCache.set(address, coords);
    }
    if (coords) {
      const { error: updateError } = await supabase
        .from("donors")
        .update({ location_lat: coords.lat, location_lng: coords.lng })
        .eq("id", id);
      if (updateError) failed += 1;
      else geocoded += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    geocoded,
    failed,
    total: cap,
    message:
      cap < toGeocode.length
        ? `Geocoded ${geocoded} of ${cap} (${toGeocode.length - cap} remaining; run again to continue).`
        : `Geocoded ${geocoded} donors.`,
  });
}
