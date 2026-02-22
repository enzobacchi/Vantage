"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarIcon } from "lucide-react"
import { format, startOfYear, endOfYear, subYears, type DateRange } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type DateRangePreset = "lifetime" | "ytd" | "last-year" | "custom"

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "lifetime", label: "Lifetime" },
  { value: "ytd", label: "Year to Date" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom" },
]

function getPresetRange(preset: DateRangePreset): DateRange<Date> | null {
  const now = new Date()
  switch (preset) {
    case "lifetime":
      return null
    case "ytd":
      return { from: startOfYear(now), to: now }
    case "last-year":
      return {
        from: startOfYear(subYears(now, 1)),
        to: endOfYear(subYears(now, 1)),
      }
    case "custom":
      return null
    default:
      return null
  }
}

function presetFromRange(range: DateRange<Date> | undefined): DateRangePreset {
  if (!range?.from || !range.to) return "lifetime"
  const fromStr = format(range.from, "yyyy-MM-dd")
  const toStr = format(range.to, "yyyy-MM-dd")
  const now = new Date()
  const ytdFromStr = format(startOfYear(now), "yyyy-MM-dd")
  const ytdToStr = format(now, "yyyy-MM-dd")
  const lastYearFromStr = format(startOfYear(subYears(now, 1)), "yyyy-MM-dd")
  const lastYearToStr = format(endOfYear(subYears(now, 1)), "yyyy-MM-dd")

  if (fromStr === ytdFromStr && toStr === ytdToStr) return "ytd"
  if (fromStr === lastYearFromStr && toStr === lastYearToStr) return "last-year"
  return "custom"
}

function formatRangeDisplay(
  range: DateRange<Date> | undefined,
  preset: DateRangePreset
): string {
  if (!range?.from || preset === "lifetime") return "Lifetime"
  if (preset === "ytd") return "Year to Date"
  if (preset === "last-year") return "Last Year"
  const fromStr = format(range.from, "MMM d, yyyy")
  const toStr = range.to ? format(range.to, "MMM d, yyyy") : fromStr
  return fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`
}

function toUrlParams(range: DateRange<Date> | undefined): { from?: string; to?: string } {
  if (!range?.from || !range.to) return {}
  return {
    from: format(range.from, "yyyy-MM-dd"),
    to: format(range.to, "yyyy-MM-dd"),
  }
}

function parseUrlParams(searchParams: URLSearchParams): DateRange<Date> | undefined {
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (!from || !to) return undefined
  const fromDate = new Date(`${from}T12:00:00`)
  const toDate = new Date(`${to}T12:00:00`)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return undefined
  if (fromDate > toDate) return { from: toDate, to: fromDate }
  return { from: fromDate, to: toDate }
}

export type DateRangeFilterProps = {
  className?: string
  /** Called when URL is updated (for parent to refetch). Not needed if using searchParams. */
  /** Receives the new range when URL is updated. Use to refetch data. */
  onRangeChange?: (range: DateRange<Date> | undefined) => void
}

/**
 * Reusable date range filter with presets (Lifetime, YTD, Last Year, Custom)
 * and URL state (?from=YYYY-MM-DD&to=YYYY-MM-DD). Shareable view.
 */
export function DateRangeFilter({ className, onRangeChange }: DateRangeFilterProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const urlRange = React.useMemo(() => parseUrlParams(searchParams), [searchParams])
  const [preset, setPreset] = React.useState<DateRangePreset>(() =>
    urlRange ? presetFromRange(urlRange) : "lifetime"
  )
  const [selected, setSelected] = React.useState<DateRange<Date> | undefined>(urlRange)
  const [popoverOpen, setPopoverOpen] = React.useState(false)

  React.useEffect(() => {
    const parsed = parseUrlParams(searchParams)
    setSelected(parsed)
    setPreset(parsed ? presetFromRange(parsed) : "lifetime")
  }, [searchParams])

  const updateUrl = React.useCallback(
    (range: DateRange<Date> | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (range?.from && range?.to) {
        params.set("from", format(range.from, "yyyy-MM-dd"))
        params.set("to", format(range.to, "yyyy-MM-dd"))
      } else {
        params.delete("from")
        params.delete("to")
      }
      const q = params.toString()
      const href = q ? `${pathname}?${q}` : pathname
      router.replace(href, { scroll: false })
      onRangeChange?.(range ?? undefined)
    },
    [pathname, router, searchParams, onRangeChange]
  )

  const handlePresetClick = (p: DateRangePreset) => {
    setPreset(p)
    if (p === "lifetime") {
      setSelected(undefined)
      updateUrl(undefined)
      setPopoverOpen(false)
    } else if (p === "custom") {
      setSelected(undefined)
    } else {
      const range = getPresetRange(p)
      if (range) {
        setSelected(range)
        updateUrl(range)
        setPopoverOpen(false)
      }
    }
  }

  const handleCalendarSelect = (range: DateRange<Date> | undefined) => {
    setSelected(range)
    if (range?.from && range?.to) {
      setPreset("custom")
      updateUrl(range)
    }
  }

  const displayLabel = formatRangeDisplay(selected, preset)

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 h-9 justify-start text-left font-normal", className)}
        >
          <CalendarIcon className="size-4 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col border-r p-2">
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => handlePresetClick(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="p-3">
              <Calendar
                mode="range"
                selected={selected}
                onSelect={handleCalendarSelect}
                numberOfMonths={1}
                defaultMonth={selected?.from ?? selected?.to ?? new Date()}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Read from/to from URL (for server/data fetching). */
export function getDateRangeFromSearchParams(
  searchParams: URLSearchParams
): { from?: string; to?: string } {
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (!from || !to) return {}
  return { from, to }
}
