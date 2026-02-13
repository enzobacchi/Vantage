"use client"

import * as React from "react"
import {
  RouteDonorWithCoords,
  RouteDonorWithIcebreaker,
  getDonorsForRoute,
  optimizeRoute,
} from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ExternalLink, ChevronLeft, ChevronRight, Bookmark, Trash2 } from "lucide-react"

const RECENT_ROUTES_KEY = "vantage-recent-routes"
const MAX_RECENT_ROUTES = 10
const DONORS_PER_PAGE = 9

type SavedRouteDonor = {
  id: string
  display_name: string | null
  billing_address: string | null
  last_donation_date: string | null
  icebreaker?: string
  location_lat?: number
  location_lng?: number
}

type SavedRoute = {
  id: string
  name: string
  startLocation: string
  radius: number
  minDonation: string
  isOptimized: boolean
  donors: SavedRouteDonor[]
  createdAt: string
}

function getRecentRoutes(): SavedRoute[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_ROUTES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRouteToRecent(route: Omit<SavedRoute, "id" | "createdAt">): void {
  const list = getRecentRoutes()
  const newRoute: SavedRoute = {
    ...route,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  const next = [newRoute, ...list].slice(0, MAX_RECENT_ROUTES)
  localStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(next))
}

function removeRecentRoute(id: string): void {
  const list = getRecentRoutes().filter((r) => r.id !== id)
  localStorage.setItem(RECENT_ROUTES_KEY, JSON.stringify(list))
}

function formatLastGift(date: string | null): string {
  if (!date) return "—"
  try {
    return new Date(date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

type DonorWithAddress = { billing_address: string | null }

function generateGoogleMapsUrl(
  startZip: string,
  donors: DonorWithAddress[]
): string {
  const addresses = donors
    .map((d) => d.billing_address?.trim())
    .filter((a): a is string => Boolean(a))
  if (addresses.length === 0) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startZip)}`
  }
  const destination = addresses[addresses.length - 1]
  const waypoints = addresses.slice(0, -1)
  const params = new URLSearchParams({
    api: "1",
    origin: startZip,
    destination,
    ...(waypoints.length > 0 ? { waypoints: waypoints.join("|") } : {}),
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export default function RoutesPage() {
  const [startLocation, setStartLocation] = React.useState("")
  const [radius, setRadius] = React.useState(15)
  const [minDonation, setMinDonation] = React.useState<string>("")
  const [loading, setLoading] = React.useState(false)
  const [donors, setDonors] = React.useState<RouteDonorWithCoords[]>([])
  const [optimizedDonors, setOptimizedDonors] =
    React.useState<RouteDonorWithIcebreaker[] | null>(null)
  const [optimizing, setOptimizing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [recentRoutes, setRecentRoutes] = React.useState<SavedRoute[]>([])
  const [listPage, setListPage] = React.useState(1)

  React.useEffect(() => {
    setRecentRoutes(getRecentRoutes())
  }, [])

  const minDonationNum =
    minDonation.trim() === ""
      ? undefined
      : (() => {
          const n = Number(minDonation)
          return Number.isFinite(n) && n >= 0 ? n : undefined
        })()

  const handleFind = async () => {
    setError(null)
    setLoading(true)
    setDonors([])
    setOptimizedDonors(null)
    try {
      const list = await getDonorsForRoute(startLocation, radius, minDonationNum)
      setDonors(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load donors.")
    } finally {
      setLoading(false)
    }
  }

  const handleOptimize = async () => {
    if (donors.length === 0 || !startLocation.trim()) return
    setError(null)
    setOptimizing(true)
    setOptimizedDonors(null)
    try {
      const list = await optimizeRoute(donors, startLocation.trim())
      setOptimizedDonors(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to optimize route.")
    } finally {
      setOptimizing(false)
    }
  }

  const displayList = optimizedDonors ?? donors
  const isItinerary = optimizedDonors !== null
  const hasSearched = donors.length > 0 || loading

  React.useEffect(() => {
    setListPage(1)
  }, [displayList.length])

  const totalPages = Math.max(1, Math.ceil(displayList.length / DONORS_PER_PAGE))
  const paginatedList = displayList.slice(
    (listPage - 1) * DONORS_PER_PAGE,
    listPage * DONORS_PER_PAGE
  )

  const handleSaveRoute = () => {
    if (displayList.length === 0 || !startLocation.trim()) return
    const name = `${startLocation.trim()} – ${displayList.length} stop${displayList.length === 1 ? "" : "s"}`
    const donorsToSave: SavedRouteDonor[] = displayList.map((d) => ({
      id: d.id,
      display_name: d.display_name,
      billing_address: d.billing_address,
      last_donation_date: d.last_donation_date,
      ...(isItinerary && "icebreaker" in d ? { icebreaker: d.icebreaker } : {}),
      ...("location_lat" in d && d.location_lat != null ? { location_lat: d.location_lat, location_lng: d.location_lng } : {}),
    }))
    saveRouteToRecent({
      name,
      startLocation: startLocation.trim(),
      radius,
      minDonation,
      isOptimized: isItinerary,
      donors: donorsToSave,
    })
    setRecentRoutes(getRecentRoutes())
  }

  const handleLoadRoute = (route: SavedRoute) => {
    setStartLocation(route.startLocation)
    setRadius(route.radius)
    setMinDonation(route.minDonation)
    const restored: RouteDonorWithCoords[] = route.donors
      .filter((d) => d.location_lat != null && d.location_lng != null)
      .map((d) => ({
        id: d.id,
        display_name: d.display_name,
        billing_address: d.billing_address,
        last_donation_date: d.last_donation_date,
        location_lat: d.location_lat!,
        location_lng: d.location_lng!,
      }))
    const fallback: RouteDonorWithCoords[] = route.donors.map((d) => ({
      id: d.id,
      display_name: d.display_name,
      billing_address: d.billing_address,
      last_donation_date: d.last_donation_date,
      location_lat: d.location_lat ?? 0,
      location_lng: d.location_lng ?? 0,
    }))
    setDonors(restored.length > 0 ? restored : fallback)
    if (route.isOptimized && route.donors.some((d) => "icebreaker" in d && d.icebreaker)) {
      setOptimizedDonors(
        route.donors.map((d) => ({
          id: d.id,
          display_name: d.display_name,
          billing_address: d.billing_address,
          last_donation_date: d.last_donation_date,
          icebreaker: d.icebreaker ?? "",
        }))
      )
    } else {
      setOptimizedDonors(null)
    }
    setListPage(1)
  }

  const handleRemoveRecent = (id: string) => {
    removeRecentRoute(id)
    setRecentRoutes(getRecentRoutes())
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Route Planner
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Find donors by location, optimize the route, and open in Google Maps.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: Control Panel (1/3) */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <Card className="rounded-xl border shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Plan Your Trip</CardTitle>
                <CardDescription>
                  Enter a city or zip and radius. Results are donors within that distance (using their saved coordinates).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label htmlFor="route-start">Starting City or Zip</Label>
                  <Input
                    id="route-start"
                    placeholder="e.g. Troy, MI or 48095"
                    value={startLocation}
                    onChange={(e) => setStartLocation(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFind()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Radius (miles)</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={5}
                      max={50}
                      step={1}
                      value={[radius]}
                      onValueChange={(v) => setRadius(v[0] ?? 15)}
                      className="flex-1"
                    />
                    <span className="text-muted-foreground w-9 text-right text-sm tabular-nums">
                      {radius}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route-min-donation">Minimum Donation ($)</Label>
                  <Input
                    id="route-min-donation"
                    type="number"
                    min={0}
                    step={100}
                    placeholder="e.g. 1000"
                    value={minDonation}
                    onChange={(e) => setMinDonation(e.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Only include donors with lifetime value at least this amount.
                  </p>
                </div>
                <Button
                  onClick={handleFind}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Searching…" : "Find Donors"}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Routes */}
            <Card className="min-h-[120px] flex-1 rounded-xl border shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Recent Routes</CardTitle>
                <CardDescription>
                  Save the current route or load a previous one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {recentRoutes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No recent routes yet. Find donors and save a route.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentRoutes.map((route) => (
                      <li
                        key={route.id}
                        className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{route.name}</p>
                          <p className="text-muted-foreground text-xs">{route.donors.length} stop{route.donors.length !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => handleLoadRoute(route)}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveRecent(route.id)}
                            aria-label="Remove route"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Results & Map (2/3) */}
          <div className="flex min-h-0 flex-col gap-4 lg:col-span-2">
            {!hasSearched ? (
              <Card className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-16 shadow-sm">
                <CardContent className="flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-muted-foreground text-sm">
                    Waiting for search…
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Enter a city or zip and click Find Donors to see results.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-xs">
                <CardHeader className="flex-shrink-0 flex flex-row flex-wrap items-start justify-between gap-3 border-b">
                  <div>
                    <CardTitle className="text-base">Donors</CardTitle>
                    <CardDescription>
                      {isItinerary
                        ? `Optimized route: ${displayList.length} stop${displayList.length === 1 ? "" : "s"}`
                        : `${donors.length} donor${donors.length === 1 ? "" : "s"} found`}
                    </CardDescription>
                  </div>
                  {donors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveRoute}
                        disabled={displayList.length === 0}
                        title="Save this route to Recent Routes"
                      >
                        <Bookmark className="mr-1.5 size-4" />
                        Save route
                      </Button>
                      {isItinerary && optimizedDonors && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={generateGoogleMapsUrl(startLocation.trim(), optimizedDonors)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1.5 size-4" />
                            Open in Google Maps
                          </a>
                        </Button>
                      )}
                      <Button
                        variant={isItinerary ? "outline" : "default"}
                        size="sm"
                        onClick={handleOptimize}
                        disabled={optimizing}
                      >
                        {optimizing ? "Optimizing…" : "Optimize Route"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-auto p-0">
                  {error ? (
                    <p className="text-destructive px-6 py-4 text-sm">{error}</p>
                  ) : displayList.length > 0 ? (
                    <>
                      <ul className="divide-y divide-border">
                        {paginatedList.map((d, i) => {
                          const globalIndex = (listPage - 1) * DONORS_PER_PAGE + i
                          return (
                            <li
                              key={d.id}
                              className="flex flex-col gap-1.5 px-6 py-3"
                            >
                              {isItinerary && (
                                <span className="text-primary text-xs font-semibold uppercase tracking-wide">
                                  Step {globalIndex + 1}
                                </span>
                              )}
                              <span className="font-medium">
                                {d.display_name ?? "—"}
                              </span>
                              <span className="text-muted-foreground text-sm">
                                {d.billing_address ?? "—"}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                Last gift: {formatLastGift(d.last_donation_date)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setListPage((p) => Math.max(1, p - 1))}
                            disabled={listPage <= 1}
                          >
                            <ChevronLeft className="size-4" />
                            Previous
                          </Button>
                          <span className="text-muted-foreground text-sm tabular-nums">
                            Page {listPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
                            disabled={listPage >= totalPages}
                          >
                            Next
                            <ChevronRight className="size-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                      No donors to display.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
