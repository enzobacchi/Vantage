"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconFilter,
  IconMap,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconSettings2,
} from "@tabler/icons-react"
import Map, { Marker, Popup } from "react-map-gl/mapbox"
import type { MapRef } from "react-map-gl/mapbox"

/** Catches WebGL/map init errors and shows a friendly message instead of a blank map. */
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.error("[Donor map]", error.message)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

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
  email: string | null
  phone: string | null
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

/** Stored as strings so inputs can be empty while typing. Parsed when evaluating. */
export type ColorRangeInput = { color: string; minInput: string; maxInput: string }

const DEFAULT_COLOR_RANGES: ColorRangeInput[] = [
  { color: "bg-gray-500", minInput: "0", maxInput: "500" },
  { color: "bg-blue-500", minInput: "500", maxInput: "5000" },
  { color: "bg-orange-500", minInput: "5000", maxInput: "20000" },
  { color: "bg-red-500", minInput: "20000", maxInput: "" },
]

/** Parsed range for evaluation: min inclusive, max exclusive (null = no upper bound). */
type ColorRangeParsed = { color: string; min: number; max: number | null }

function parseColorRanges(inputs: ColorRangeInput[]): ColorRangeParsed[] {
  return inputs.map((r) => {
    const min = (r.minInput.trim() !== "" && Number.isFinite(Number(r.minInput)))
      ? Number(r.minInput)
      : 0
    const max =
      r.maxInput.trim() === ""
        ? null
        : Number.isFinite(Number(r.maxInput))
          ? Number(r.maxInput)
          : null
    return { color: r.color, min, max }
  })
}

/** Pin color by lifetime value: ranges use >= min and < max (no gaps). */
function getPinColorByLtv(
  ltv: number | string | null,
  parsedRanges: ColorRangeParsed[]
): string {
  const n = ltv == null ? 0 : Number(ltv)
  if (!Number.isFinite(n)) return "bg-gray-500"
  for (const range of parsedRanges) {
    if (n >= range.min && (range.max === null || n < range.max)) {
      return range.color
    }
  }
  return parsedRanges[0]?.color ?? "bg-gray-500"
}

function isWebGLSupported(): boolean {
  if (typeof window === "undefined") return true
  try {
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    return !!gl
  } catch {
    return false
  }
}

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

const WEBGL_FALLBACK = (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
    <p className="text-sm font-medium text-muted-foreground">
      Map couldn’t load (WebGL failed)
    </p>
    <p className="text-xs text-muted-foreground max-w-sm">
      Try Chrome or Edge, enable hardware acceleration in your browser
      settings, or use a different device.
    </p>
  </div>
)

const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12"

export function DonorMapView() {
  const router = useRouter()
  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const mapRef = useRef<MapRef>(null)
  const [points, setPoints] = useState<DonorMapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DonorMapPoint | null>(null)
  const [flyToSearchOpen, setFlyToSearchOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [webglOk, setWebglOk] = useState<boolean | null>(null)
  useEffect(() => {
    setWebglOk(isWebGLSupported())
  }, [])

  const [colorRanges, setColorRanges] = useState<ColorRangeInput[]>(DEFAULT_COLOR_RANGES)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("vantage-map-color-ranges")
      if (raw) {
        const parsed = JSON.parse(raw) as ColorRangeInput[] | Array<{ color: string; min: number; max: number | null }> | null
        if (Array.isArray(parsed) && parsed.length > 0) {
          const asInputs: ColorRangeInput[] = parsed.map((r: ColorRangeInput | { color: string; min: number; max: number | null }) =>
            "minInput" in r
              ? r
              : { color: r.color, minInput: String(r.min), maxInput: r.max == null ? "" : String(r.max) }
          )
          setColorRanges(asInputs)
        }
      }
    } catch {
      // ignore
    }
  }, [])
  useEffect(() => {
    try {
      window.localStorage.setItem("vantage-map-color-ranges", JSON.stringify(colorRanges))
    } catch {
      // ignore
    }
  }, [colorRanges])

  const parsedColorRanges = useMemo(() => parseColorRanges(colorRanges), [colorRanges])

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

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (map) {
      requestAnimationFrame(() => {
        map.resize()
      })
    }
  }, [])

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

      {/* Map: explicit height so Mapbox GL can render tiles; resize() onLoad fixes blank tiles */}
      <div className="relative w-full h-[60vh] min-h-[400px] flex-1 overflow-hidden rounded-lg border bg-muted/30">
            {!mapboxToken ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Map requires{" "}
                  <code className="rounded bg-muted px-1">
                    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
                  </code>
                  {" "}or{" "}
                  <code className="rounded bg-muted px-1">
                    NEXT_PUBLIC_MAPBOX_TOKEN
                  </code>
                  .
                </p>
                <p className="text-xs text-muted-foreground">
                  In Vercel: Settings → Environment Variables → add for Production and Preview.
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : webglOk === false ? (
              WEBGL_FALLBACK
            ) : loading ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <p className="text-sm text-muted-foreground">Loading map…</p>
              </div>
            ) : (
              <MapErrorBoundary fallback={WEBGL_FALLBACK}>
              <div className="absolute inset-0 h-full w-full">
              <Map
                ref={mapRef}
                mapboxAccessToken={mapboxToken}
                initialViewState={initialViewState}
                mapStyle={MAPBOX_STYLE}
                reuseMaps
                onLoad={handleMapLoad}
                style={{ width: "100%", height: "100%" }}
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
                      onClick={() => {
                        mapRef.current?.flyTo({
                          center: [p.location_lng, p.location_lat],
                          zoom: 12,
                          duration: 800,
                          essential: true,
                        })
                        setSelected(p)
                      }}
                      className={`rounded-full p-1 text-white shadow ${getPinColorByLtv(p.total_lifetime_value, parsedColorRanges)}`}
                      aria-label={`View ${p.display_name ?? "donor"}`}
                    >
                      <IconMapPin className="size-4" />
                    </button>
                  </Marker>
                ))}

                {/* Map Legend & Settings: bottom-left */}
                <div className="absolute bottom-3 left-3 z-10 flex items-start gap-3">
                  <Popover open={legendOpen} onOpenChange={setLegendOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur hover:bg-muted/50"
                        aria-label="Map legend and settings"
                      >
                        <IconSettings2 className="size-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Legend &amp; settings
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start" side="top">
                      <div className="border-b px-3 py-2">
                        <div className="text-sm font-medium">Lifetime value colors</div>
                        <div className="text-xs text-muted-foreground">
                          Adjust min/max to change marker colors
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-3 space-y-3">
                        {colorRanges.map((range, i) => (
                          <div key={i} className="flex items-center gap-2 rounded border p-2">
                            <span
                              className={`size-6 shrink-0 rounded-full ${range.color}`}
                              title={range.color}
                            />
                            <div className="flex flex-1 items-center gap-2">
                              <Label className="text-xs shrink-0">Min</Label>
                              <Input
                                type="number"
                                min={0}
                                step={100}
                                placeholder="0"
                                value={range.minInput}
                                onChange={(e) => {
                                  const next = [...colorRanges]
                                  next[i] = { ...next[i], minInput: e.target.value }
                                  setColorRanges(next)
                                }}
                                className="h-8 text-xs"
                              />
                              <Label className="text-xs shrink-0">Max</Label>
                              <Input
                                type="number"
                                min={0}
                                step={100}
                                placeholder="∞"
                                value={range.maxInput}
                                onChange={(e) => {
                                  const next = [...colorRanges]
                                  next[i] = { ...next[i], maxInput: e.target.value }
                                  setColorRanges(next)
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t px-3 py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setColorRanges(DEFAULT_COLOR_RANGES.map((r) => ({ ...r })))}
                        >
                          Reset to defaults
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-col gap-1 rounded-md border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
                    <div className="text-xs font-medium text-muted-foreground">Lifetime value</div>
                    {parsedColorRanges.map((range, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`size-2.5 shrink-0 rounded-full ${range.color}`} />
                        <span>
                          ${range.min.toLocaleString()}
                          {range.max == null ? "+" : ` – $${range.max.toLocaleString()}`}
                        </span>
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
                    className="[&_.mapboxgl-popup-content]:!p-0 [&_.mapboxgl-popup-content]:!bg-background [&_.mapboxgl-popup-content]:!text-foreground [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-border [&_.mapboxgl-popup-content]:rounded-lg [&_.mapboxgl-popup-content]:shadow-md"
                  >
                    <div className="min-w-56 rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
                      <h3 className="font-semibold text-foreground leading-tight">
                        <Link
                          href={`/donors/${selected.id}`}
                          className="hover:underline focus:outline-none focus:underline text-inherit"
                        >
                          {selected.display_name ?? "Unknown Donor"}
                        </Link>
                      </h3>
                      {(selected.email ?? selected.phone) ? (
                        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {selected.email ? (
                            <div className="truncate" title={selected.email}>
                              {selected.email}
                            </div>
                          ) : null}
                          {selected.phone ? (
                            <div>{selected.phone}</div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-2 text-xs text-muted-foreground">
                        Total giving:{" "}
                        {selected.total_lifetime_value == null
                          ? "—"
                          : `$${Number(selected.total_lifetime_value).toLocaleString()}`}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full h-8 text-xs"
                        onClick={() => router.push(`/donors/${selected.id}`)}
                      >
                        View profile
                      </Button>
                    </div>
                  </Popup>
                ) : null}
              </Map>
              </div>
              </MapErrorBoundary>
            )}
      </div>
    </div>
  )
}
