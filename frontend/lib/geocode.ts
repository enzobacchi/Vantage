/**
 * Shared geocoding helper using Mapbox Geocoding API.
 * Used by QB sync and CSV import.
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
