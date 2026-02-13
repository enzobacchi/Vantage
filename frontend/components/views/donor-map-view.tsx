"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  IconFilter,
  IconMap,
  IconMapPin,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react"
import Map, { Marker, Popup } from "react-map-gl/mapbox"
import type { MapRef } from "react-map-gl/mapbox"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Params sent to the map API; all optional. */
export interface DonorFilterParams {
  status?: string
  minGiving?: number
  maxGiving?: number
}

type DonorMapPoint = {
  id: string
  display_name: string | null
  total_lifetime_value: number | string | null
  last_donation_date: string | null
  location_lat: number
  location_lng: number
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "lapsed", label: "Lapsed" },
] as const

/** Pin color by lifetime value: Grey $0–500, Blue $500–5k, Orange $5k–20k, Red $20k+ */
function getPinColorByLtv(ltv: number | string | null): string {
  const n = ltv == null ? 0 : Number(ltv)
  if (!Number.isFinite(n)) return "bg-gray-500"
  if (n < 500) return "bg-gray-500"
  if (n < 5000) return "bg-blue-500"
  if (n < 20000) return "bg-orange-500"
  return "bg-red-500"
}

const MAP_LEGEND_ITEMS = [
  { label: "$0 – $500", color: "bg-gray-500" },
  { label: "$500 – $5k", color: "bg-blue-500" },
  { label: "$5k – $20k", color: "bg-orange-500" },
  { label: "$20k+", color: "bg-red-500" },
] as const

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  const prevValue = useRef<T>(value)
  useEffect(() => {
    if (value === prevValue.current) return
    prevValue.current = value
    const t = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function buildMapUrl(params: DonorFilterParams): string {
  const search = new URLSearchParams()
  if (params.status && params.status !== "all") search.set("status", params.status)
  if (params.minGiving != null && Number.isFinite(params.minGiving)) {
    search.set("minGiving", String(params.minGiving))
  }
  if (params.maxGiving != null && Number.isFinite(params.maxGiving)) {
    search.set("maxGiving", String(params.maxGiving))
  }
  const q = search.toString()
  return q ? `/api/donors/map?${q}` : "/api/donors/map"
}

export function DonorMapView() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const mapRef = useRef<MapRef>(null)
  const [points, setPoints] = useState<DonorMapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DonorMapPoint | null>(null)
  const [flyToSearchOpen, setFlyToSearchOpen] = useState(false)

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [minGivingInput, setMinGivingInput] = useState<string>("")
  const [maxGivingInput, setMaxGivingInput] = useState<string>("")
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null)

  const debouncedMinGiving = useDebouncedValue(minGivingInput, 300)
  const debouncedMaxGiving = useDebouncedValue(maxGivingInput, 300)

  const minGivingNum = useMemo(() => {
    const n = parseFloat(debouncedMinGiving)
    return Number.isFinite(n) ? n : undefined
  }, [debouncedMinGiving])
  const maxGivingNum = useMemo(() => {
    const n = parseFloat(debouncedMaxGiving)
    return Number.isFinite(n) ? n : undefined
  }, [debouncedMaxGiving])

  const filterParams: DonorFilterParams = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      minGiving: minGivingNum,
      maxGiving: maxGivingNum,
    }),
    [statusFilter, minGivingNum, maxGivingNum]
  )

  const fetchMap = useCallback(
    async (params: DonorFilterParams) => {
      const url = buildMapUrl(params)
      const res = await fetch(url)
      const data = (await res.json()) as unknown
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: string }).error)
            : ""
        throw new Error(msg || `Failed to load donors (HTTP ${res.status}).`)
      }
      return Array.isArray(data) ? (data as DonorMapPoint[]) : []
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const list = await fetchMap(filterParams)
        if (cancelled) return
        setPoints(list)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load donor map.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [filterParams, fetchMap])

  const runGeocodeBackfill = useCallback(async () => {
    setGeocodeMessage(null)
    setGeocodeLoading(true)
    try {
      const res = await fetch("/api/donors/geocode-backfill", { method: "POST" })
      const data = (await res.json()) as { geocoded?: number; failed?: number; message?: string; error?: string }
      if (!res.ok) {
        setGeocodeMessage(data.error ?? "Geocode backfill failed.")
        return
      }
      setGeocodeMessage(data.message ?? `Geocoded ${data.geocoded ?? 0} donors.`)
      const list = await fetchMap(filterParams)
      setPoints(list)
    } catch {
      setGeocodeMessage("Failed to run geocode backfill.")
    } finally {
      setGeocodeLoading(false)
    }
  }, [fetchMap, filterParams])

  useEffect(() => {
    if (selected && !points.some((p) => p.id === selected.id)) {
      setSelected(null)
    }
  }, [points, selected])

  const flyToDonor = useCallback((donor: DonorMapPoint) => {
    mapRef.current?.flyTo({
      center: [donor.location_lng, donor.location_lat],
      zoom: 14,
      duration: 1200,
    })
    setSelected(donor)
    setFlyToSearchOpen(false)
  }, [])

  const initialViewState = useMemo(() => {
    const first = points[0]
    if (first) {
      return {
        latitude: first.location_lat,
        longitude: first.location_lng,
        zoom: 8,
      }
    }
    return { latitude: 39.5, longitude: -98.35, zoom: 3 }
  }, [points])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconMap className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">Donor Map</h1>
        </div>
      </div>

      {/* Filter bar above the map */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <IconFilter className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        <Popover open={flyToSearchOpen} onOpenChange={setFlyToSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={flyToSearchOpen}
              className="h-9 w-64 justify-start gap-2 font-normal text-muted-foreground"
            >
              <IconSearch className="size-4 shrink-0" />
              <span className="truncate">Find donor on map…</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command className="rounded-lg border-0 shadow-none">
              <CommandInput placeholder="Search donors…" className="h-9" />
              <CommandList>
                <CommandEmpty>No donor found.</CommandEmpty>
                <CommandGroup>
                  {points.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.display_name ?? "Unknown"}
                      onSelect={() => flyToDonor(p)}
                      className="cursor-pointer"
                    >
                      <IconMapPin className="mr-2 size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.display_name ?? "Unknown"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger size="sm" className="h-9 w-28">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            step={100}
            placeholder="Min $"
            value={minGivingInput}
            onChange={(e) => setMinGivingInput(e.target.value)}
            className="h-9 w-24 text-xs"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="number"
            min={0}
            step={100}
            placeholder="Max $"
            value={maxGivingInput}
            onChange={(e) => setMaxGivingInput(e.target.value)}
            className="h-9 w-24 text-xs"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={geocodeLoading}
          onClick={runGeocodeBackfill}
        >
          <IconRefresh className="mr-2 size-4" />
          {geocodeLoading ? "Geocoding…" : "Load locations"}
        </Button>
        {geocodeMessage && (
          <p className="text-xs text-muted-foreground">{geocodeMessage}</p>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {points.length} donor{points.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Map: full width below filter bar */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
            {!mapboxToken ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-muted-foreground">
                  Missing{" "}
                  <code className="rounded bg-muted px-1">
                    NEXT_PUBLIC_MAPBOX_TOKEN
                  </code>
                  .
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : loading ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-muted-foreground">Loading map…</p>
              </div>
            ) : (
              <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                initialViewState={initialViewState}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                reuseMaps
              >
                {points.map((p) => (
                  <Marker
                    key={p.id}
                    latitude={p.location_lat}
                    longitude={p.location_lng}
                    anchor="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className={`rounded-full p-1 text-white shadow ${getPinColorByLtv(p.total_lifetime_value)}`}
                      aria-label={`Open donor ${p.display_name ?? "Unknown"}`}
                    >
                      <IconMapPin className="size-4" />
                    </button>
                  </Marker>
                ))}

                {/* Legend: bottom-left */}
                <div className="absolute bottom-3 left-3 z-10 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Lifetime value</div>
                  <div className="flex flex-col gap-1">
                    {MAP_LEGEND_ITEMS.map((item) => (
                      <div key={item.color} className="flex items-center gap-2 text-xs">
                        <span className={`size-2.5 rounded-full shrink-0 ${item.color}`} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selected ? (
                  <Popup
                    latitude={selected.location_lat}
                    longitude={selected.location_lng}
                    anchor="top"
                    onClose={() => setSelected(null)}
                    closeButton
                    closeOnClick={false}
                    className="[&_.mapboxgl-popup-content]:!bg-background [&_.mapboxgl-popup-content]:!text-foreground [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-border"
                  >
                    <div className="min-w-48 space-y-1 rounded bg-background px-1 py-0.5 text-foreground">
                      <div className="text-sm font-medium text-foreground">
                        {selected.display_name ?? "Unknown Donor"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        LTV:{" "}
                        {selected.total_lifetime_value == null
                          ? "—"
                          : `$${String(selected.total_lifetime_value)}`}
                      </div>
                    </div>
                  </Popup>
                ) : null}
              </Map>
            )}
      </div>
    </div>
  )
}
