"use server"

import OpenAI from "openai"
import { getCurrentUserOrg } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type RouteDonor = {
  id: string
  display_name: string | null
  billing_address: string | null
  last_donation_date: string | null
}

/** Donor with coordinates for route sorting. */
export type RouteDonorWithCoords = RouteDonor & {
  location_lat: number
  location_lng: number
}

export type RouteDonorWithIcebreaker = RouteDonor & { icebreaker: string }

/** Geocode a city or zip (or address) to lat/lng using Mapbox. */
async function geocodeStartLocation(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !query.trim()) return null

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json`
  )
  endpoint.searchParams.set("access_token", token)
  endpoint.searchParams.set("limit", "1")

  const res = await fetch(endpoint.toString())
  if (!res.ok) return null

  const data = (await res.json()) as {
    features?: Array<{ center?: [number, number] }>
  }
  const center = data.features?.[0]?.center
  if (!center) return null
  const [lng, lat] = center
  return { lat, lng }
}

/**
 * Haversine distance in miles. Uses Earth radius in miles; result is always in miles.
 * Robust to string/number coords (coerces to number).
 */
function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959 // Radius of Earth in miles
  const lat1Rad = Number(lat1) * (Math.PI / 180)
  const lat2Rad = Number(lat2) * (Math.PI / 180)
  const dLat = (Number(lat2) - Number(lat1)) * (Math.PI / 180)
  const dLon = (Number(lon2) - Number(lon1)) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanceInMiles = R * c
  return distanceInMiles
}

/** Euclidean distance (in degree units) between two lat/lng points. Used for nearest-neighbor ordering. */
function euclideanDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2)
}

/**
 * Greedy "Nearest Neighbor" sort: start at startLocation, repeatedly pick the closest unvisited donor.
 * Returns donors in driving order. Uses Euclidean distance for ordering.
 */
export async function sortRouteByDistance(
  startLocation: { lat: number; lng: number },
  donors: RouteDonorWithCoords[]
): Promise<RouteDonorWithCoords[]> {
  if (donors.length === 0) return []

  const sorted: RouteDonorWithCoords[] = []
  let currentLat = startLocation.lat
  let currentLng = startLocation.lng
  const remaining = [...donors]

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = euclideanDistance(
      currentLat,
      currentLng,
      remaining[0].location_lat,
      remaining[0].location_lng
    )
    for (let i = 1; i < remaining.length; i++) {
      const d = euclideanDistance(
        currentLat,
        currentLng,
        remaining[i].location_lat,
        remaining[i].location_lng
      )
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    sorted.push(next)
    currentLat = next.location_lat
    currentLng = next.location_lng
  }

  return sorted
}

/** Resolve current org id from session (user must be logged in and have an org). */
async function getCurrentOrgId(): Promise<string | null> {
  const userOrg = await getCurrentUserOrg()
  return userOrg?.orgId ?? null
}

/**
 * Fetch donors for route planning using geospatial radius.
 * Geocodes the start location (city or zip) via Mapbox, then returns donors
 * with non-null location_lat/location_lng whose Haversine distance (miles) is <= radiusMiles.
 * Uses same org as Donor Map so results match. Fallback: if 0 results, try zip/address match.
 */
export async function getDonorsForRoute(
  startLocation: string,
  radiusMiles: number
): Promise<RouteDonorWithCoords[]> {
  const trimmed = String(startLocation).trim()
  if (!trimmed) return []

  const coords = await geocodeStartLocation(trimmed)
  if (!coords) {
    throw new Error("Could not find that location. Try a city name or full zip code.")
  }

  const orgId = await getCurrentOrgId()
  if (!orgId) throw new Error("Sign in and connect an organization to use the route planner.")

  const supabase = createAdminClient()
  const radiusMilesNum = Math.max(0, Number(radiusMiles))

  // Fetch all donors with coords in pages (Supabase caps at 1000 per request)
  const PAGE_SIZE = 1000
  const rows: RouteDonorWithCoords[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from("donors")
      .select("id, display_name, billing_address, last_donation_date, location_lat, location_lng")
      .eq("org_id", orgId)
      .not("location_lat", "is", null)
      .not("location_lng", "is", null)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as RouteDonorWithCoords[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const filtered = rows.filter((d) => {
    const lat = Number(d.location_lat)
    const lng = Number(d.location_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
    const distanceInMiles = haversineMiles(coords.lat, coords.lng, lat, lng)
    return distanceInMiles <= radiusMilesNum
  })

  // Fallback: if geospatial returns 0, try zip or address match (return only donors with coords)
  if (filtered.length === 0) {
    const zipOnly = /^\d{5}(-\d{4})?$/.test(trimmed.replace(/\s/g, ""))
    const fallbackRows: RouteDonorWithCoords[] = []
    let fallbackOffset = 0
    while (true) {
      let fallbackQuery = supabase
        .from("donors")
        .select("id, display_name, billing_address, last_donation_date, location_lat, location_lng")
        .eq("org_id", orgId)
        .not("location_lat", "is", null)
        .not("location_lng", "is", null)
        .range(fallbackOffset, fallbackOffset + PAGE_SIZE - 1)
      if (zipOnly) {
        const zip = trimmed.replace(/\D/g, "").slice(0, 5)
        fallbackQuery = fallbackQuery.ilike("zip", zip)
      } else {
        fallbackQuery = fallbackQuery.ilike("billing_address", `%${trimmed}%`)
      }
      const { data: fallbackData } = await fallbackQuery
      const page = (fallbackData ?? []) as RouteDonorWithCoords[]
      fallbackRows.push(...page)
      if (page.length < PAGE_SIZE) break
      fallbackOffset += PAGE_SIZE
    }
    if (fallbackRows.length > 0) {
      return fallbackRows
    }
  }

  return filtered
}

/**
 * Optimize route: (A) sort donors by nearest-neighbor from start, (B) LLM adds icebreakers only.
 * Route order is deterministic; AI does not reorder.
 */
export async function optimizeRoute(
  donors: RouteDonorWithCoords[],
  startLocation: string
): Promise<RouteDonorWithIcebreaker[]> {
  if (donors.length === 0) return []

  const coords = await geocodeStartLocation(startLocation.trim())
  if (!coords) {
    throw new Error("Could not find start location for route order.")
  }

  // Step A: Greedy nearest-neighbor sort (deterministic route order)
  const sortedDonors = await sortRouteByDistance(coords, donors)

  // Step B: LLM adds icebreakers only; do not reorder
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY")

  const openai = new OpenAI({ apiKey })
  const systemPrompt = `You are a Fundraising Assistant. I will provide a list of donors in a driving route order. For each donor, write a 1-sentence "Icebreaker" (under 15 words) based on their last gift date and context. Do not reorder the list.

Rules:
- If last_donation_date is missing: suggest asking if they would be interested in learning about your new initiative.
- If last gift was over 12 months ago: suggest mentioning it has been a while and asking for an update.
- If last gift was within the last 3 months: suggest thanking them for their recent support.

Respond with a single JSON object: { "stops": [ { "id": "<donor id>", "icebreaker": "<exactly one short sentence, under 15 words>" }, ... ] }
Include every donor id exactly once in the same order as the list. Do not reorder.`

  const userMessage = JSON.stringify(
    sortedDonors.map((d) => ({
      id: d.id,
      display_name: d.display_name,
      billing_address: d.billing_address,
      last_donation_date: d.last_donation_date,
    }))
  )

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? "{}"
  let parsed: { stops?: Array<{ id?: string; icebreaker?: string }> }
  try {
    parsed = JSON.parse(raw) as { stops?: Array<{ id?: string; icebreaker?: string }> }
  } catch {
    return sortedDonors.map((d) => ({ ...d, icebreaker: "" }))
  }

  const stops = Array.isArray(parsed.stops) ? parsed.stops : []
  const byId = new Map(sortedDonors.map((d) => [d.id, d]))
  const result: RouteDonorWithIcebreaker[] = []

  for (const stop of stops) {
    const id = stop?.id
    const donor = id ? byId.get(id) : null
    if (donor) {
      result.push({
        ...donor,
        icebreaker: typeof stop.icebreaker === "string" ? stop.icebreaker.trim() : "",
      })
    }
  }

  const resultIds = new Set(result.map((r) => r.id))
  for (const d of sortedDonors) {
    if (!resultIds.has(d.id)) result.push({ ...d, icebreaker: "" })
  }

  return result
}
