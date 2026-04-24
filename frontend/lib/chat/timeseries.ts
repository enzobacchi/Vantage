/**
 * Pure date-bucketing helpers for chat analytics tools.
 * All bucketing is UTC-based to match the rest of the chat system-prompt
 * (which documents "today" in the organization's local frame only for copy,
 * but computes dates as UTC strings).
 */

export type Interval = "day" | "week" | "month" | "quarter" | "year"

/**
 * Return the bucket key for a date at the given interval.
 *
 *   bucket("2025-03-15", "day")     → "2025-03-15"
 *   bucket("2025-03-15", "week")    → "2025-W11"           (ISO week, Mon-start)
 *   bucket("2025-03-15", "month")   → "2025-03"
 *   bucket("2025-03-15", "quarter") → "2025-Q1"
 *   bucket("2025-03-15", "year")    → "2025"
 *
 * Returns `null` for unparseable input.
 */
export function bucketDate(dateStr: string, interval: Interval): string | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null

  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() // 0-indexed
  const day = d.getUTCDate()

  switch (interval) {
    case "day":
      return `${y}-${pad(m + 1)}-${pad(day)}`
    case "month":
      return `${y}-${pad(m + 1)}`
    case "quarter":
      return `${y}-Q${Math.floor(m / 3) + 1}`
    case "year":
      return String(y)
    case "week":
      return isoWeek(d)
  }
}

/**
 * Return every bucket key between two dates (inclusive). Useful for
 * back-filling empty buckets so charts don't have gaps.
 */
export function enumerateBuckets(
  from: string,
  to: string,
  interval: Interval
): string[] {
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  if (start > end) return []

  const out: string[] = []
  const seen = new Set<string>()
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  )
  const endUtc = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  )

  // Cap the enumeration so a malformed range can't spin forever.
  let steps = 0
  while (cursor <= endUtc && steps < 5000) {
    const key = bucketDate(cursor.toISOString(), interval)
    if (key && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
    cursor.setUTCDate(cursor.getUTCDate() + incrementDays(interval))
    steps++
  }
  return out
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** ISO 8601 week key (YYYY-Www), Monday-start. */
function isoWeek(d: Date): string {
  // Clone as UTC midnight
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
  // ISO: day 1 = Monday … day 7 = Sunday
  const dayNum = target.getUTCDay() || 7
  // Shift to the Thursday of the current ISO week (ISO weeks are defined by Thursday)
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  )
  return `${target.getUTCFullYear()}-W${pad(weekNo)}`
}

/**
 * How many days to advance the cursor per step in `enumerateBuckets`.
 * Intentionally small so we don't skip over a bucket boundary.
 */
function incrementDays(interval: Interval): number {
  switch (interval) {
    case "day":
      return 1
    case "week":
      return 7
    case "month":
      return 28
    case "quarter":
      return 28
    case "year":
      return 28
  }
}
