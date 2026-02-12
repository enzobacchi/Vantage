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
import { ExternalLink } from "lucide-react"

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
  const [loading, setLoading] = React.useState(false)
  const [donors, setDonors] = React.useState<RouteDonorWithCoords[]>([])
  const [optimizedDonors, setOptimizedDonors] =
    React.useState<RouteDonorWithIcebreaker[] | null>(null)
  const [optimizing, setOptimizing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleFind = async () => {
    setError(null)
    setLoading(true)
    setDonors([])
    setOptimizedDonors(null)
    try {
      const list = await getDonorsForRoute(startLocation, radius)
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
                <Button
                  onClick={handleFind}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Searching…" : "Find Donors"}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Routes placeholder */}
            <Card className="min-h-[120px] flex-1 rounded-xl border shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">Recent Routes</CardTitle>
                <CardDescription>
                  Your saved or recent routes will appear here.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm">No recent routes yet.</p>
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
                    <ul className="divide-y divide-border">
                      {displayList.map((d, index) => (
                        <li
                          key={d.id}
                          className="flex flex-col gap-1.5 px-6 py-3"
                        >
                          {isItinerary && (
                            <span className="text-primary text-xs font-semibold uppercase tracking-wide">
                              Step {index + 1}
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
                      ))}
                    </ul>
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
