"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useNav } from "@/components/nav-context"
import {
  IconFilter,
  IconMap,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconSettings2,
  IconCircle,
  IconPolygon,
  IconTrash,
  IconFileReport,
} from "@tabler/icons-react"
import Map, { Marker, Popup } from "react-map-gl/mapbox"
import type { MapRef } from "react-map-gl/mapbox"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { isPointInPolygon, isPointInCircle } from "@/lib/geo-utils"

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

import { createBrowserSupabaseClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/format"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"

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
  const { openDonor, setActiveView } = useNav()
  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const mapRef = useRef<MapRef>(null)
  const drawRef = useRef<MapboxDraw | null>(null)
  const pointsRef = useRef<DonorMapPoint[]>([])
  const circleModeRef = useRef(false)
  const [points, setPoints] = useState<DonorMapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DonorMapPoint | null>(null)
  const [flyToSearchOpen, setFlyToSearchOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [webglOk, setWebglOk] = useState<boolean | null>(null)
  const [selectedByDraw, setSelectedByDraw] = useState<DonorMapPoint[]>([])
  const [drawMode, setDrawMode] = useState<"polygon" | "circle" | null>(null)
  const [circleCenter, setCircleCenter] = useState<[number, number] | null>(null)
  const [circleRadiusInput, setCircleRadiusInput] = useState("")
  const [generateReportLoading, setGenerateReportLoading] = useState(false)
  const [showAllSelectedDonors, setShowAllSelectedDonors] = useState(false)

  const INITIAL_DONORS_SHOWN = 10
  const donorsToShow =
    showAllSelectedDonors || selectedByDraw.length <= INITIAL_DONORS_SHOWN
      ? selectedByDraw
      : selectedByDraw.slice(0, INITIAL_DONORS_SHOWN)
  const hasMoreDonors = selectedByDraw.length > INITIAL_DONORS_SHOWN

  pointsRef.current = points
  circleModeRef.current = drawMode === "circle"
  useEffect(() => {
    setWebglOk(isWebGLSupported())
  }, [])

  const [colorRanges, setColorRanges] = useState<ColorRangeInput[]>(DEFAULT_COLOR_RANGES)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [minGivingInput, setMinGivingInput] = useState<string>("")
  const [maxGivingInput, setMaxGivingInput] = useState<string>("")

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  const mapPrefsKey = currentUserId ? `vantage-map-prefs-${currentUserId}` : null

  // Get user ID on mount
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) setCurrentUserId(data.user.id)
      else setPrefsLoaded(true)
    })
  }, [])

  // Load all prefs when key is ready
  useEffect(() => {
    if (!mapPrefsKey) return
    try {
      const raw = window.localStorage.getItem(mapPrefsKey)
      if (raw) {
        const p = JSON.parse(raw) as {
          statusFilter?: string
          minGiving?: string
          maxGiving?: string
          colorRanges?: ColorRangeInput[]
        }
        if (p.statusFilter) setStatusFilter(p.statusFilter)
        if (p.minGiving != null) setMinGivingInput(p.minGiving)
        if (p.maxGiving != null) setMaxGivingInput(p.maxGiving)
        if (Array.isArray(p.colorRanges) && p.colorRanges.length) setColorRanges(p.colorRanges)
      } else {
        // Migrate legacy non-user-scoped color ranges
        const old = window.localStorage.getItem("vantage-map-color-ranges")
        if (old) {
          try {
            const c = JSON.parse(old) as ColorRangeInput[] | null
            if (Array.isArray(c) && c.length) setColorRanges(c)
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    setPrefsLoaded(true)
  }, [mapPrefsKey])

  // Save all prefs on change
  useEffect(() => {
    if (!mapPrefsKey || !prefsLoaded) return
    try {
      window.localStorage.setItem(mapPrefsKey, JSON.stringify({
        statusFilter, minGiving: minGivingInput, maxGiving: maxGivingInput, colorRanges
      }))
    } catch { /* ignore */ }
  }, [mapPrefsKey, prefsLoaded, statusFilter, minGivingInput, maxGivingInput, colorRanges])

  const parsedColorRanges = useMemo(() => parseColorRanges(colorRanges), [colorRanges])
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
    if (!prefsLoaded) return
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
  }, [filterParams, fetchMap, prefsLoaded])

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

  const filterDonorsByPolygon = useCallback(
    (polygon: number[][], donors: DonorMapPoint[]) =>
      donors.filter((p) =>
        isPointInPolygon([p.location_lng, p.location_lat], polygon)
      ),
    []
  )

  const filterDonorsByCircle = useCallback(
    (center: [number, number], radiusMiles: number, donors: DonorMapPoint[]) =>
      donors.filter((p) =>
        isPointInCircle([p.location_lng, p.location_lat], center, radiusMiles)
      ),
    []
  )

  const handleDrawCreate = useCallback(
    (e: { features?: Array<{ geometry?: { type?: string; coordinates?: number[][][] } }> }) => {
      const features = e.features ?? []
      const pts = pointsRef.current
      if (features.length === 0) return
      for (const f of features) {
        const geom = f.geometry
        if (geom?.type === "Polygon" && geom.coordinates) {
          const ring = geom.coordinates[0]
          if (ring && ring.length >= 3) {
            const polygon = ring.map((c) => [c[0], c[1]] as [number, number])
            setSelectedByDraw(filterDonorsByPolygon(polygon, pts))
            return
          }
        }
      }
    },
    [filterDonorsByPolygon]
  )

  const handleDrawUpdate = useCallback(() => {
    const draw = drawRef.current
    const pts = pointsRef.current
    if (!draw) return
    const data = draw.getAll()
    if (data.features.length > 0) {
      const f = data.features[0]
      const geom = f.geometry
      if (geom?.type === "Polygon" && geom.coordinates) {
        const ring = geom.coordinates[0]
        if (ring && ring.length >= 3) {
          const polygon = ring.map((c) => [c[0], c[1]] as [number, number])
          setSelectedByDraw(filterDonorsByPolygon(polygon, pts))
        }
      }
    }
  }, [filterDonorsByPolygon])

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    requestAnimationFrame(() => {
      map.resize()
    })
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false },
    })
    ;(map as { addControl: (c: unknown, pos?: string) => void }).addControl(draw, "top-left")
    drawRef.current = draw
    map.on("draw.create", handleDrawCreate)
    map.on("draw.update", handleDrawUpdate)
    map.on("click", (e: { lngLat: { lng: number; lat: number } }) => {
      if (circleModeRef.current) {
        setCircleCenter([e.lngLat.lng, e.lngLat.lat])
      }
    })
  }, [handleDrawCreate, handleDrawUpdate])

  const activatePolygonMode = useCallback(() => {
    setDrawMode("polygon")
    setCircleCenter(null)
    setCircleRadiusInput("")
    drawRef.current?.changeMode("draw_polygon")
  }, [])

  const activateCircleMode = useCallback(() => {
    setDrawMode("circle")
    setCircleCenter(null)
    setCircleRadiusInput("")
    drawRef.current?.changeMode("simple_select")
    drawRef.current?.deleteAll()
  }, [])

  const clearDraw = useCallback(() => {
    setDrawMode(null)
    setCircleCenter(null)
    setCircleRadiusInput("")
    setSelectedByDraw([])
    setShowAllSelectedDonors(false)
    drawRef.current?.deleteAll()
    drawRef.current?.changeMode("simple_select")
  }, [])

  const applyCircleFilter = useCallback(() => {
    const center = circleCenter
    const radius = Number(circleRadiusInput)
    if (!center || !Number.isFinite(radius) || radius <= 0 || radius > 500) return
    const filtered = filterDonorsByCircle(center, radius, points)
    setSelectedByDraw(filtered)
    setCircleRadiusInput("")
  }, [circleCenter, circleRadiusInput, filterDonorsByCircle, points])

  const handleGenerateReport = useCallback(async () => {
    if (selectedByDraw.length === 0) return
    setGenerateReportLoading(true)
    try {
      const title = `Map selection - ${new Date().toLocaleDateString()}`
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorIds: selectedByDraw.map((p) => p.id),
          selectedColumns: ["display_name", "email", "lifetime_value", "last_gift_date"],
          title,
          visibility: "private",
        }),
      })
      const data = (await res.json()) as { reportId?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create report.")
        return
      }
      toast.success("Report created.")
      if (data.reportId) {
        setActiveView("saved-reports")
      }
    } catch {
      toast.error("Failed to create report.")
    } finally {
      setGenerateReportLoading(false)
    }
  }, [selectedByDraw, setActiveView])

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

      {/* Draw toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Select by area:</span>
        <Button
          type="button"
          variant={drawMode === "polygon" ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={activatePolygonMode}
        >
          <IconPolygon className="mr-1.5 size-4" />
          Polygon
        </Button>
        <Button
          type="button"
          variant={drawMode === "circle" ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={activateCircleMode}
        >
          <IconCircle className="mr-1.5 size-4" />
          Circle
        </Button>
        {(drawMode || selectedByDraw.length > 0) && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearDraw}>
            <IconTrash className="mr-1.5 size-4" />
            Clear
          </Button>
        )}
        {drawMode === "circle" && (
          <div className="ml-2 flex items-center gap-2 border-l pl-2">
            {circleCenter ? (
              <>
                <Input
                  type="number"
                  min={0.1}
                  max={500}
                  step={1}
                  placeholder="Radius (mi)"
                  value={circleRadiusInput}
                  onChange={(e) => setCircleRadiusInput(e.target.value)}
                  className="h-8 w-24 text-xs"
                />
                <Button type="button" size="sm" className="h-8" onClick={applyCircleFilter}>
                  Apply
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Click map to set center</span>
            )}
          </div>
        )}
      </div>

      {/* Map + optional selected donors panel */}
      <div className="flex gap-4 flex-1 min-h-0">
      {/* Map: explicit height so Mapbox GL can render tiles; resize() onLoad fixes blank tiles */}
      <div className="relative flex-1 w-full h-[60vh] min-h-[400px] overflow-hidden rounded-lg border bg-muted/30">
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
                <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
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
                  <div className="flex w-[150px] flex-col gap-1 rounded-md border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
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
                      <button
                        type="button"
                        className="font-semibold text-foreground leading-tight text-primary hover:underline block text-left w-full"
                        onClick={() => {
                          openDonor(selected.id)
                          setSelected(null)
                        }}
                      >
                        {selected.display_name ?? "Unknown Donor"}
                      </button>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Total giving:{" "}
                        {selected.total_lifetime_value == null
                          ? "—"
                          : formatCurrency(selected.total_lifetime_value)}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full h-8 text-xs"
                        onClick={() => {
                          openDonor(selected.id)
                          setSelected(null)
                        }}
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

      {/* Selected donors panel */}
      {selectedByDraw.length > 0 && (
        <div className="w-80 shrink-0 flex flex-col rounded-lg border bg-zinc-50 overflow-hidden h-[60vh] min-h-[400px]">
          <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
            <span className="text-sm font-medium text-zinc-950">
              {selectedByDraw.length} donor{selectedByDraw.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {donorsToShow.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline truncate block text-left w-full"
                      onClick={() => openDonor(p.id)}
                    >
                      {p.display_name ?? "Unknown"}
                    </button>
                    <div className="text-xs text-zinc-500">
                      {p.total_lifetime_value != null
                        ? formatCurrency(p.total_lifetime_value)
                        : "—"}
                      {p.last_donation_date &&
                        ` · ${new Date(p.last_donation_date).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={() => openDonor(p.id)}
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
            {hasMoreDonors && !showAllSelectedDonors && (
              <div className="p-2 pt-0">
                <button
                  type="button"
                  onClick={() => setShowAllSelectedDonors(true)}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  See more ({selectedByDraw.length - INITIAL_DONORS_SHOWN} more)
                </button>
              </div>
            )}
            {hasMoreDonors && showAllSelectedDonors && (
              <div className="p-2 pt-0">
                <button
                  type="button"
                  onClick={() => setShowAllSelectedDonors(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Show less
                </button>
              </div>
            )}
          </ScrollArea>
          <div className="border-t p-3 shrink-0">
            <Button
              type="button"
              className="w-full"
              disabled={generateReportLoading}
              onClick={handleGenerateReport}
            >
              <IconFileReport className="mr-2 size-4" />
              {generateReportLoading ? "Creating…" : "Generate Report"}
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
