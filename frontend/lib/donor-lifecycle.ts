/**
 * Donor lifecycle status based on giving history.
 * Used for list badges and profile header.
 */
export type LifecycleStatus = "New" | "Active" | "Lapsed" | "Lost"

export type DonorLifecycleResult = {
  status: LifecycleStatus
  isMajor: boolean
}

/** Configurable thresholds for status and major-donor badge. */
export type LifecycleConfig = {
  /** New: last gift within this many months. Default 6. */
  newDonorMonths?: number
  /** Lapsed: no gift in this many months. Default 12. */
  lapsedMonths?: number
  /** Lost: no gift in this many months. Default 24. */
  lostMonths?: number
  /** Major donor: lifetime value above this. Default 5000. */
  majorDonorThreshold?: number
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

const DEFAULT_NEW_MONTHS = 6
const DEFAULT_LAPSED_MONTHS = 12
const DEFAULT_LOST_MONTHS = 24
const DEFAULT_MAJOR_THRESHOLD = 5000

export type DonorForLifecycle = {
  last_donation_date?: string | null
  first_donation_date?: string | null
  total_lifetime_value?: number | string | null
}

/** Order for "sort by status": Lapsed and Lost first (re-engagement priority), then Active, then New. */
export const STATUS_SORT_ORDER: LifecycleStatus[] = ["Lapsed", "Lost", "Active", "New"]

/** Default config values. */
export const DEFAULT_LIFECYCLE_CONFIG: Required<LifecycleConfig> = {
  newDonorMonths: DEFAULT_NEW_MONTHS,
  lapsedMonths: DEFAULT_LAPSED_MONTHS,
  lostMonths: DEFAULT_LOST_MONTHS,
  majorDonorThreshold: DEFAULT_MAJOR_THRESHOLD,
}

/**
 * Returns lifecycle status and major-donor flag for a donor.
 * Uses optional config for thresholds; otherwise defaults (New ≤6mo, Lapsed >12mo, Lost >24mo, Major >$5k).
 */
export function getDonorLifecycleStatus(
  donor: DonorForLifecycle,
  config?: LifecycleConfig | null
): DonorLifecycleResult {
  const newMonths = config?.newDonorMonths ?? DEFAULT_NEW_MONTHS
  const lapsedMonths = config?.lapsedMonths ?? DEFAULT_LAPSED_MONTHS
  const lostMonths = config?.lostMonths ?? DEFAULT_LOST_MONTHS
  const majorThreshold = config?.majorDonorThreshold ?? DEFAULT_MAJOR_THRESHOLD

  const now = Date.now()
  const lastDate = donor.last_donation_date
  const ltv =
    donor.total_lifetime_value != null
      ? typeof donor.total_lifetime_value === "number"
        ? donor.total_lifetime_value
        : Number(donor.total_lifetime_value)
      : 0
  const isMajor = Number.isFinite(ltv) && ltv > majorThreshold

  const lastMs = lastDate ? new Date(lastDate + "T00:00:00Z").getTime() : 0

  if (!lastDate || !Number.isFinite(lastMs)) {
    return { status: "Lapsed", isMajor }
  }

  const monthsSinceLast = (now - lastMs) / MONTH_MS

  if (monthsSinceLast > lostMonths) {
    return { status: "Lost", isMajor }
  }
  if (monthsSinceLast > lapsedMonths) {
    return { status: "Lapsed", isMajor }
  }
  if (monthsSinceLast <= newMonths) {
    return { status: "New", isMajor }
  }

  return { status: "Active", isMajor }
}
