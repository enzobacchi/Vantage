import { NextRequest, NextResponse } from "next/server"

import { requireUserOrg } from "@/lib/auth"
import {
  getDonorsForRoute,
  sortRouteByDistance,
  type RouteDonorWithCoords,
} from "@/app/dashboard/routes/actions"

export const runtime = "nodejs"

type PlanRequestBody = {
  startLocation?: string
  radiusMiles?: number
  minDonation?: number | null
}

export async function POST(req: NextRequest) {
  const auth = await requireUserOrg()
  if (!auth.ok) return auth.response

  let body: PlanRequestBody
  try {
    body = (await req.json()) as PlanRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const startLocation = typeof body.startLocation === "string" ? body.startLocation.trim() : ""
  const radiusMiles = Number(body.radiusMiles)
  const minDonation =
    body.minDonation != null && Number.isFinite(Number(body.minDonation))
      ? Number(body.minDonation)
      : undefined

  if (!startLocation) {
    return NextResponse.json(
      { error: "startLocation is required (zip code, city, or address)." },
      { status: 400 },
    )
  }
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return NextResponse.json(
      { error: "radiusMiles must be a positive number." },
      { status: 400 },
    )
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "Map service is not configured on the server." },
      { status: 500 },
    )
  }

  let donors: RouteDonorWithCoords[]
  let startCoords: { lat: number; lng: number } | null = null
  try {
    const geocodeUrl = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        startLocation,
      )}.json`,
    )
    geocodeUrl.searchParams.set("access_token", token)
    geocodeUrl.searchParams.set("limit", "1")
    const geocodeRes = await fetch(geocodeUrl.toString())
    if (geocodeRes.ok) {
      const geocodeData = (await geocodeRes.json()) as {
        features?: Array<{ center?: [number, number] }>
      }
      const center = geocodeData.features?.[0]?.center
      if (center) {
        const [lng, lat] = center
        startCoords = { lat, lng }
      }
    }

    donors = await getDonorsForRoute(startLocation, radiusMiles, minDonation)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to find donors."
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let orderedDonors = donors
  if (startCoords && donors.length > 0) {
    orderedDonors = await sortRouteByDistance(startCoords, donors)
  }

  return NextResponse.json({
    donors: orderedDonors,
    startCoords,
  })
}
