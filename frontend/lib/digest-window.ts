/**
 * Date window for the weekly digest: the 7 full UTC days before the run day,
 * end-exclusive. Consecutive weekly runs tile exactly, so no gift is counted
 * in two digests. All values are YYYY-MM-DD, compared against donations.date.
 */
export type DigestWindow = {
  /** First day of this digest's week (inclusive). */
  start: string
  /** Run day (exclusive) — its gifts belong to next week's digest. */
  end: string
  /** First day of the comparison week; it ends at `start` (exclusive). */
  prevStart: string
}

function utcDay(now: Date, offsetDays: number): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays)
  )
    .toISOString()
    .slice(0, 10)
}

export function getDigestWindow(now: Date): DigestWindow {
  return {
    start: utcDay(now, -7),
    end: utcDay(now, 0),
    prevStart: utcDay(now, -14),
  }
}
