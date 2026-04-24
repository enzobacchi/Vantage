"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useRouter } from "next/navigation"
import { useNav } from "@/components/nav-context"
import { ExternalLink, MapPin, Navigation, X, Filter, Map as MapIcon, RefreshCw, Search, Settings2, Circle, Pentagon, Trash2, FileText, Download, FilePlus } from "lucide-react"
import Map, { Marker, Popup, Source, Layer } from "react-map-gl/mapbox"
import type { MapRef } from "react-map-gl/mapbox"
import MapboxDraw from "@mapbox/mapbox-gl-draw"
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
import { isPointInPolygon, isPointInCircle } from "@/lib/geo-utils"
import {
  type RouteDonorWithCoords,
  type RouteDonorWithIcebreaker,
  getDonorsForRoute,
  optimizeRoute,
  saveRouteReport,
} from "@/app/dashboard/routes/actions"
import { toCsv } from "@/lib/csv"
import { DEFAULT_REPORT_COLUMNS } from "@/lib/report-columns"
import { ReportColumnsPicker } from "@/components/reports/report-columns-picker"

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
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

/** Params sent to the map API; all optional. */
export interface DonorFilterParams {
  status?: string
  minGiving?: number
  maxGiving?: number
  assignedTo?: string
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
    // Try webgl2 first, fall back to webgl, then experimental-webgl
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")
    // Clean up context to free resources
    if (gl && typeof (gl as WebGLRenderingContext).getExtension === "function") {
      (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext()
    }
    return !!gl
  } catch {
    // If canvas check fails, don't block — let Mapbox try anyway.
    // The MapErrorBoundary will catch actual failures.
    return true
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
  if (params.assignedTo && params.assignedTo !== "all") {
    search.set("assignedTo", params.assignedTo)
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

  // Route planner state
  const [routeMode, setRouteMode] = useState(false)
  const [routeStartLocation, setRouteStartLocation] = useState("")
  const [routeRadius, setRouteRadius] = useState(15)
  const [routeMinDonation, setRouteMinDonation] = useState("")
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeOptimizing, setRouteOptimizing] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeDonors, setRouteDonors] = useState<RouteDonorWithCoords[]>([])
  const [routeOptimized, setRouteOptimized] = useState<RouteDonorWithIcebreaker[] | null>(null)
  const [routeReportDialogOpen, setRouteReportDialogOpen] = useState(false)
  const [routeReportName, setRouteReportName] = useState("")
  const [routeReportColumns, setRouteReportColumns] = useState<string[]>([...DEFAULT_REPORT_COLUMNS])
  const [routeReportSaving, setRouteReportSaving] = useState(false)
  const router = useRouter()

  const INITIAL_DONORS_SHOWN = 10
  const donorsToShow =
    showAllSelectedDonors || selectedByDraw.length <= INITIAL_DONORS_SHOWN
      ? selectedByDraw
      : selectedByDraw.slice(0, INITIAL_DONORS_SHOWN)
  const hasMoreDonors = selectedByDraw.length > INITIAL_DONORS_SHOWN

  useEffect(() => { pointsRef.current = points }, [points])
  useEffect(() => { circleModeRef.current = drawMode === "circle" }, [drawMode])

  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    // Check immediately, but if it fails, retry after a short delay —
    // some browsers (Arc, Brave) lazy-init the GPU process.
    if (isWebGLSupported()) {
      setWebglOk(true)
    } else {
      const t = setTimeout(() => setWebglOk(isWebGLSupported()), 500)
      return () => clearTimeout(t)
    }
  }, [])

  const [colorRanges, setColorRanges] = useState<ColorRangeInput[]>(DEFAULT_COLOR_RANGES)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [minGivingInput, setMinGivingInput] = useState<string>("")
  const [maxGivingInput, setMaxGivingInput] = useState<string>("")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")
  const [orgAssignees, setOrgAssignees] = useState<{ user_id: string; name: string }[]>([])

  useEffect(() => {
    import("@/app/actions/team")
      .then((m) => m.getOrgAssignees())
      .then((list) => setOrgAssignees(list.map((a) => ({ user_id: a.user_id, name: a.name }))))
      .catch(() => {})
  }, [])

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
      assignedTo: assigneeFilter === "all" ? undefined : assigneeFilter,
    }),
    [statusFilter, minGivingNum, maxGivingNum, assigneeFilter]
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
    setMapReady(true)
  }, [])

  // Manage MapboxDraw lifecycle separately so it survives reuseMaps re-navigation
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current?.getMap()
    if (!map) return

    // With reuseMaps, the draw control may already exist on the underlying map.
    // Store the instance on the map object to detect this case.
    const mapAny = map as unknown as Record<string, unknown>
    let draw = mapAny._vantageDraw as MapboxDraw | undefined
    if (!draw) {
      draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: false, trash: false },
      })
      ;(map as { addControl: (c: unknown, pos?: string) => void }).addControl(draw, "top-left")
      mapAny._vantageDraw = draw
    }
    drawRef.current = draw

    const onDrawCreate = (e: unknown) => handleDrawCreate(e as { features?: Array<{ geometry?: { type?: string; coordinates?: number[][][] } }> })
    const onDrawUpdate = () => handleDrawUpdate()
    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      if (circleModeRef.current) {
        setCircleCenter([e.lngLat.lng, e.lngLat.lat])
      }
    }

    map.on("draw.create", onDrawCreate)
    map.on("draw.update", onDrawUpdate)
    map.on("click", onClick)

    return () => {
      map.off("draw.create", onDrawCreate)
      map.off("draw.update", onDrawUpdate)
      map.off("click", onClick)
    }
  }, [mapReady, handleDrawCreate, handleDrawUpdate])

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

  // Route planner handlers
  const routeDisplayList = routeOptimized ?? routeDonors
  const routeIsOptimized = routeOptimized !== null

  const handleRouteFindDonors = useCallback(async () => {
    setRouteError(null)
    setRouteLoading(true)
    setRouteDonors([])
    setRouteOptimized(null)
    try {
      const minNum = routeMinDonation.trim() === "" ? undefined : Number(routeMinDonation)
      const list = await getDonorsForRoute(routeStartLocation, routeRadius, minNum && Number.isFinite(minNum) && minNum >= 0 ? minNum : undefined)
      setRouteDonors(list)
      // Fit map to route results
      if (list.length > 0 && mapRef.current) {
        const lats = list.map((d) => d.location_lat)
        const lngs = list.map((d) => d.location_lng)
        const sw: [number, number] = [Math.min(...lngs) - 0.05, Math.min(...lats) - 0.05]
        const ne: [number, number] = [Math.max(...lngs) + 0.05, Math.max(...lats) + 0.05]
        mapRef.current.fitBounds([sw, ne], { padding: 60, duration: 1200 })
      }
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "Failed to find donors.")
    } finally {
      setRouteLoading(false)
    }
  }, [routeStartLocation, routeRadius, routeMinDonation])

  const handleRouteOptimize = useCallback(async () => {
    if (routeDonors.length === 0 || !routeStartLocation.trim()) return
    setRouteError(null)
    setRouteOptimizing(true)
    setRouteOptimized(null)
    try {
      const list = await optimizeRoute(routeDonors, routeStartLocation.trim())
      setRouteOptimized(list)
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : "Failed to optimize route.")
    } finally {
      setRouteOptimizing(false)
    }
  }, [routeDonors, routeStartLocation])

  const handleCloseRouteMode = useCallback(() => {
    setRouteMode(false)
    setRouteDonors([])
    setRouteOptimized(null)
    setRouteError(null)
    setRouteStartLocation("")
    setRouteRadius(15)
    setRouteMinDonation("")
  }, [])

  const slugForFile = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "route"

  const handleRouteExportCsv = useCallback(() => {
    if (routeDisplayList.length === 0) return
    const hasIcebreaker =
      routeIsOptimized &&
      routeOptimized?.some((d) => d.icebreaker && d.icebreaker.trim().length > 0)

    const headers = ["Step", "Name", "Address", "Last Gift"]
    if (hasIcebreaker) headers.push("Icebreaker")

    const rows = routeDisplayList.map((d, i) => {
      const row: (string | number | null | undefined)[] = [
        routeIsOptimized ? i + 1 : "",
        d.display_name ?? "",
        d.billing_address ?? "",
        d.last_donation_date ?? "",
      ]
      if (hasIcebreaker) {
        const ic = "icebreaker" in d ? d.icebreaker : ""
        row.push(ic ?? "")
      }
      return row
    })

    const csv = toCsv(headers, rows)
    const today = new Date().toISOString().slice(0, 10)
    const filename = `vantage-route-${slugForFile(routeStartLocation.trim())}-${today}.csv`

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("CSV downloaded", {
      description: `${routeDisplayList.length} donor${routeDisplayList.length === 1 ? "" : "s"} exported.`,
    })
  }, [routeDisplayList, routeIsOptimized, routeOptimized, routeStartLocation])

  const openRouteReportDialog = useCallback(() => {
    if (routeDisplayList.length === 0 || !routeStartLocation.trim()) return
    const stops = routeDisplayList.length
    setRouteReportName(
      `${routeStartLocation.trim()} — ${stops} stop${stops === 1 ? "" : "s"}`
    )
    setRouteReportColumns((prev) => (prev.length ? prev : [...DEFAULT_REPORT_COLUMNS]))
    setRouteReportDialogOpen(true)
  }, [routeDisplayList.length, routeStartLocation])

  const handleSaveRouteReport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const title = routeReportName.trim()
      if (!title) {
        toast.error("Enter a report name.")
        return
      }
      if (routeDisplayList.length === 0) {
        toast.error("No donors to save.")
        return
      }
      if (routeReportColumns.length === 0) {
        toast.error("Select at least one column.")
        return
      }
      const minNum = Number(routeMinDonation)
      const minDonation =
        routeMinDonation.trim() !== "" && Number.isFinite(minNum) && minNum >= 0
          ? minNum
          : undefined
      setRouteReportSaving(true)
      try {
        const { id } = await saveRouteReport({
          name: title,
          startLocation: routeStartLocation.trim(),
          radius: routeRadius,
          minDonation,
          isOptimized: routeIsOptimized,
          donorIds: routeDisplayList.map((d) => d.id),
          selectedColumns: routeReportColumns,
        })
        toast.success("Report saved", { description: `"${title}" created.` })
        setRouteReportDialogOpen(false)
        setRouteReportName("")
        router.push(`/dashboard?view=saved-reports&reportId=${encodeURIComponent(id)}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save report.")
      } finally {
        setRouteReportSaving(false)
      }
    },
    [
      routeReportName,
      routeReportColumns,
      routeDisplayList,
      routeMinDonation,
      routeStartLocation,
      routeRadius,
      routeIsOptimized,
      router,
    ]
  )

  const generateGoogleMapsUrl = useCallback((startZip: string, donors: { billing_address: string | null }[]) => {
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
  }, [])

  // GeoJSON line for route visualization
  const routeLineGeoJSON = useMemo(() => {
    if (!routeIsOptimized || routeDisplayList.length < 2) return null
    const coords = (routeDisplayList as RouteDonorWithCoords[])
      .filter((d) => d.location_lng != null && d.location_lat != null)
      .map((d) => [d.location_lng, d.location_lat])
    if (coords.length < 2) return null
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coords,
      },
    }
  }, [routeDisplayList, routeIsOptimized])

  const routeLineStyle = useMemo(() => ({
    id: "route-line" as const,
    type: "line" as const,
    paint: {
      "line-color": "#007A3F",
      "line-width": 3,
      "line-dasharray": [2, 1],
    },
  }), [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapIcon className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">Donor Map</h1>
        </div>
      </div>

      {/* Filter bar above the map */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
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
              <Search className="size-4 shrink-0" />
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
                      <MapPin className="mr-2 size-4 shrink-0 text-muted-foreground" />
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
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger size="sm" className="h-9 w-40">
            <SelectValue placeholder="Assigned To" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">
              <span className="italic text-muted-foreground">Unassigned</span>
            </SelectItem>
            {orgAssignees.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                {a.name}
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
          <RefreshCw className="mr-2 size-4" />
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
        <span className="text-xs font-medium text-muted-foreground">Tools:</span>
        <Button
          type="button"
          variant={routeMode ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => {
            if (routeMode) {
              handleCloseRouteMode()
            } else {
              setRouteMode(true)
              clearDraw()
            }
          }}
        >
          <Navigation className="mr-1.5 size-4" />
          Route Planner
        </Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <span className="text-xs font-medium text-muted-foreground">Select by area:</span>
        <Button
          type="button"
          variant={drawMode === "polygon" ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={activatePolygonMode}
        >
          <Pentagon className="mr-1.5 size-4" />
          Polygon
        </Button>
        <Button
          type="button"
          variant={drawMode === "circle" ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={activateCircleMode}
        >
          <Circle className="mr-1.5 size-4" />
          Circle
        </Button>
        {(drawMode || selectedByDraw.length > 0) && (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearDraw}>
            <Trash2 className="mr-1.5 size-4" />
            Clear
          </Button>
        )}
        {drawMode === "polygon" && selectedByDraw.length === 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            Click points to draw, double-click to finish
          </span>
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
                onError={(e) => {
                  // Surface basemap / tile failures instead of rendering pins
                  // on an empty canvas. Common causes: token rejected by
                  // mapbox (401), domain-restricted token, rate limit.
                  console.error("[Mapbox]", e.error)
                  const msg = e.error?.message ?? ""
                  if (msg.toLowerCase().includes("unauthorized") || msg.includes("401")) {
                    setError(
                      "Mapbox rejected the access token. Check NEXT_PUBLIC_MAPBOX_TOKEN in Vercel and that the token allows this domain."
                    )
                  }
                }}
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
                      <MapPin className="size-4" />
                    </button>
                  </Marker>
                ))}

                {/* Circle center marker */}
                {circleCenter && drawMode === "circle" && (
                  <Marker
                    latitude={circleCenter[1]}
                    longitude={circleCenter[0]}
                    anchor="center"
                  >
                    <div className="flex items-center justify-center">
                      <div className="size-4 rounded-full border-2 border-primary bg-primary/30 shadow" />
                    </div>
                  </Marker>
                )}

                {/* Route planner markers */}
                {routeMode && routeDisplayList.length > 0 && (routeDisplayList as RouteDonorWithCoords[]).map((d, i) => (
                  d.location_lat != null && d.location_lng != null ? (
                    <Marker
                      key={`route-${d.id}`}
                      latitude={d.location_lat}
                      longitude={d.location_lng}
                      anchor="center"
                    >
                      <div
                        className="flex items-center justify-center size-7 rounded-full bg-[#007A3F] text-white text-xs font-bold shadow-sm border-2 border-white"
                        title={d.display_name ?? undefined}
                      >
                        {routeIsOptimized ? i + 1 : ""}
                      </div>
                    </Marker>
                  ) : null
                ))}

                {/* Route line */}
                {routeLineGeoJSON && (
                  <Source id="route-line-source" type="geojson" data={routeLineGeoJSON}>
                    <Layer {...routeLineStyle} />
                  </Source>
                )}

                {/* Map Legend & Settings: bottom-left */}
                <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
                  <Popover open={legendOpen} onOpenChange={setLegendOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur hover:bg-muted/50"
                        aria-label="Map legend and settings"
                      >
                        <Settings2 className="size-4 text-muted-foreground" />
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
                    className="[&_.mapboxgl-popup-content]:!p-0 [&_.mapboxgl-popup-content]:!bg-background [&_.mapboxgl-popup-content]:!text-foreground [&_.mapboxgl-popup-content]:border [&_.mapboxgl-popup-content]:border-border [&_.mapboxgl-popup-content]:rounded-lg [&_.mapboxgl-popup-content]:shadow-sm"
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
      {selectedByDraw.length > 0 && !routeMode && (
        <div className="w-80 shrink-0 flex flex-col rounded-lg border bg-muted overflow-hidden h-[60vh] min-h-[400px]">
          <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
            <span className="text-sm font-medium text-foreground">
              {selectedByDraw.length} donor{selectedByDraw.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-1">
              {donorsToShow.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline truncate block text-left w-full"
                      onClick={() => openDonor(p.id)}
                    >
                      {p.display_name ?? "Unknown"}
                    </button>
                    <div className="text-xs text-muted-foreground">
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
              <FileText className="mr-2 size-4" />
              {generateReportLoading ? "Creating…" : "Generate Report"}
            </Button>
          </div>
        </div>
      )}

      {/* Route planner panel */}
      {routeMode && (
        <div className="w-80 shrink-0 flex flex-col rounded-lg border bg-muted overflow-hidden h-[60vh] min-h-[400px]">
          <div className="flex items-center justify-between border-b px-3 py-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <Navigation className="size-4 text-[#007A3F]" />
              <span className="text-sm font-semibold text-foreground">Route Planner</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCloseRouteMode}
            >
              <X className="size-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-4">
              {/* Search controls */}
              <div className="space-y-2">
                <Label htmlFor="route-start" className="text-xs">Starting City or Zip</Label>
                <Input
                  id="route-start"
                  placeholder="e.g. Troy, MI or 48095"
                  value={routeStartLocation}
                  onChange={(e) => setRouteStartLocation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRouteFindDonors()}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Radius (miles)</Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={5}
                    max={100}
                    step={5}
                    value={[routeRadius]}
                    onValueChange={(v) => setRouteRadius(v[0] ?? 15)}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground w-9 text-right text-sm tabular-nums">
                    {routeRadius}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="route-min-donation" className="text-xs">Min Donation ($)</Label>
                <Input
                  id="route-min-donation"
                  type="number"
                  min={0}
                  step={100}
                  placeholder="e.g. 1000"
                  value={routeMinDonation}
                  onChange={(e) => setRouteMinDonation(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                onClick={handleRouteFindDonors}
                disabled={routeLoading || !routeStartLocation.trim()}
                className="w-full"
                size="sm"
              >
                {routeLoading ? "Searching…" : "Find Donors"}
              </Button>

              {routeError && (
                <p className="text-destructive text-xs">{routeError}</p>
              )}

              {/* Results */}
              {routeDisplayList.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {routeIsOptimized
                        ? `${routeDisplayList.length} stop${routeDisplayList.length === 1 ? "" : "s"} (optimized)`
                        : `${routeDonors.length} donor${routeDonors.length === 1 ? "" : "s"} found`}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {routeDisplayList.map((d, i) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 rounded border bg-card px-2.5 py-2 text-sm"
                      >
                        {routeIsOptimized && (
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#007A3F] text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="font-medium text-primary hover:underline truncate block text-left w-full text-sm"
                            onClick={() => openDonor(d.id)}
                          >
                            {d.display_name ?? "Unknown"}
                          </button>
                          <p className="text-xs text-muted-foreground truncate">
                            {d.billing_address ?? "No address"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Route actions footer */}
          {routeDonors.length > 0 && (
            <div className="border-t p-3 shrink-0 space-y-2">
              <Button
                onClick={handleRouteOptimize}
                disabled={routeOptimizing}
                className="w-full"
                size="sm"
                variant={routeIsOptimized ? "outline" : "default"}
              >
                {routeOptimizing ? "Optimizing…" : "Optimize Route"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRouteExportCsv}
                  disabled={routeDisplayList.length === 0}
                  title="Download the filtered donors as a CSV file"
                >
                  <Download className="mr-1.5 size-4" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openRouteReportDialog}
                  disabled={routeDisplayList.length === 0}
                  title="Save this route as a Report in Vantage"
                >
                  <FilePlus className="mr-1.5 size-4" />
                  Save as Report
                </Button>
              </div>
              {routeIsOptimized && routeOptimized && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <a
                    href={generateGoogleMapsUrl(routeStartLocation.trim(), routeOptimized)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-1.5 size-4" />
                    Open in Google Maps
                  </a>
                </Button>
              )}
            </div>
          )}

          <Dialog open={routeReportDialogOpen} onOpenChange={setRouteReportDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Save as Report</DialogTitle>
                <DialogDescription>
                  Save this route as a Report in Vantage. It will appear in your Reports list with a snapshot of the current stops.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveRouteReport} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="map-route-report-name">Report name</Label>
                  <Input
                    id="map-route-report-name"
                    placeholder="e.g. Troy, MI — 10 stops"
                    value={routeReportName}
                    onChange={(e) => setRouteReportName(e.target.value)}
                    autoFocus
                  />
                  <p className="text-muted-foreground text-xs">
                    {routeDisplayList.length} stop
                    {routeDisplayList.length === 1 ? "" : "s"} · {routeRadius}mi radius
                    {routeIsOptimized ? " · optimized" : ""}
                  </p>
                </div>
                <ReportColumnsPicker
                  value={routeReportColumns}
                  onChange={setRouteReportColumns}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRouteReportDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      routeReportSaving ||
                      !routeReportName.trim() ||
                      routeReportColumns.length === 0
                    }
                  >
                    {routeReportSaving ? "Saving…" : "Save report"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      </div>
    </div>
  )
}
