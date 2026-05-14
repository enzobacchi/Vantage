/**
 * Shared geocoding helper using Mapbox Geocoding API.
 * Used by QB sync, CSV import, donor create/update, and geocode backfill.
 */

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address) return null;

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
  );
  endpoint.searchParams.set("access_token", token);
  endpoint.searchParams.set("limit", "1");

  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{ center?: [number, number] }>;
  };

  const center = data.features?.[0]?.center;
  if (!center) return null;
  const [lng, lat] = center;
  return { lat, lng };
}

/** Build a single-line address string for geocoding from a donor's address fields. */
export function buildAddressForGeocode(parts: {
  billing_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const addr = parts.billing_address?.trim();
  if (addr) {
    const city = parts.city?.trim();
    const state = parts.state?.trim();
    const zip = parts.zip?.trim();
    const tail = [city, state, zip].filter(Boolean).join(", ");
    return tail ? `${addr}, ${tail}` : addr;
  }
  const city = parts.city?.trim();
  const state = parts.state?.trim();
  const zip = parts.zip?.trim();
  if (city && state) return [city, state, zip].filter(Boolean).join(", ");
  if (zip) return zip;
  return null;
}
