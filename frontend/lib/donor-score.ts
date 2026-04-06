/**
 * Donor Health Score — a computed 0-100 engagement score.
 *
 * The score is deterministic (no LLM call) — it uses a weighted formula
 * across recency, frequency, monetary trend, and interaction engagement.
 * This keeps it fast, cheap, and explainable.
 *
 * Factors (weights sum to 100):
 *   Recency  (30) — how recently the donor gave
 *   Frequency (25) — how often they give
 *   Monetary  (20) — giving trend direction (growing/flat/declining)
 *   Engagement (15) — interaction recency and frequency
 *   Consistency (10) — regularity of giving intervals
 */

export type ScoreFactors = {
  recency: number // 0-100
  frequency: number // 0-100
  monetary: number // 0-100
  engagement: number // 0-100
  consistency: number // 0-100
}

export type ScoreLabel = "Excellent" | "Good" | "Fair" | "At Risk" | "Cold"

export type DonorHealthScore = {
  score: number // 0-100, integer
  label: ScoreLabel
  factors: ScoreFactors
  suggestedAsk: number | null // next ask amount
  trend: "rising" | "stable" | "declining" | "new" | "inactive"
}

/** Minimal donation record needed for scoring. */
export type DonationForScore = {
  amount: number | string | null
  date: string | null
}

/** Minimal interaction record needed for scoring. */
export type InteractionForScore = {
  date: string | null
  type: string
}

/** Input data for computing a score. */
export type ScoreInput = {
  lastDonationDate: string | null
  firstDonationDate: string | null
  totalLifetimeValue: number
  donations: DonationForScore[]
  interactions: InteractionForScore[]
}

const WEIGHTS = {
  recency: 30,
  frequency: 25,
  monetary: 20,
  engagement: 15,
  consistency: 10,
} as const

const DAY_MS = 24 * 60 * 60 * 1000

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity
  const ms = Date.now() - new Date(dateStr + "T00:00:00Z").getTime()
  return Math.max(0, ms / DAY_MS)
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}

// ────────────────────────────────────────────────────────────────────
// Factor computations
// ────────────────────────────────────────────────────────────────────

/** Recency: 100 if gave today, 0 if gave 24+ months ago. Linear decay. */
function computeRecency(lastDonationDate: string | null): number {
  const days = daysSince(lastDonationDate)
  if (!Number.isFinite(days)) return 0
  // 730 days = 24 months. Score decays linearly to 0.
  return clamp(100 * (1 - days / 730))
}

/** Frequency: based on number of gifts in the last 24 months. */
function computeFrequency(donations: DonationForScore[]): number {
  const cutoff = new Date(Date.now() - 730 * DAY_MS).toISOString().slice(0, 10)
  const recentCount = donations.filter(
    (d) => d.date && d.date >= cutoff
  ).length

  // 12+ gifts in 24 months = 100 (monthly+). Scale linearly.
  if (recentCount === 0) return 0
  if (recentCount >= 12) return 100
  return clamp((recentCount / 12) * 100)
}

/** Monetary: is giving trending up, flat, or down? Compare recent half to older half. */
function computeMonetary(donations: DonationForScore[]): {
  score: number
  trend: DonorHealthScore["trend"]
} {
  if (donations.length === 0) return { score: 0, trend: "inactive" }
  if (donations.length === 1) return { score: 50, trend: "new" }

  // Sort by date ascending
  const sorted = [...donations]
    .filter((d) => d.date)
    .sort((a, b) => a.date!.localeCompare(b.date!))

  if (sorted.length < 2) return { score: 50, trend: "new" }

  const mid = Math.floor(sorted.length / 2)
  const olderHalf = sorted.slice(0, mid)
  const recentHalf = sorted.slice(mid)

  const olderAvg =
    olderHalf.reduce((s, d) => s + toNum(d.amount), 0) / olderHalf.length
  const recentAvg =
    recentHalf.reduce((s, d) => s + toNum(d.amount), 0) / recentHalf.length

  if (olderAvg === 0 && recentAvg === 0) return { score: 50, trend: "stable" }
  if (olderAvg === 0) return { score: 80, trend: "rising" }

  const changeRatio = (recentAvg - olderAvg) / olderAvg

  let trend: DonorHealthScore["trend"]
  if (changeRatio > 0.1) trend = "rising"
  else if (changeRatio < -0.1) trend = "declining"
  else trend = "stable"

  // Map ratio to score: -50% change → 20, 0% → 60, +50% → 100
  const score = clamp(60 + changeRatio * 80)
  return { score, trend }
}

/** Engagement: based on interactions in last 12 months. */
function computeEngagement(interactions: InteractionForScore[]): number {
  const cutoff = new Date(Date.now() - 365 * DAY_MS).toISOString().slice(0, 10)
  const recent = interactions.filter((i) => i.date && i.date >= cutoff)

  if (recent.length === 0) return 0

  // 10+ interactions in 12 months = 100
  const countScore = clamp((recent.length / 10) * 100)

  // Bonus for recent interaction (within 30 days)
  const mostRecent = recent.sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
  )[0]
  const recencyBonus = mostRecent?.date
    ? clamp(100 * (1 - daysSince(mostRecent.date) / 90)) * 0.3
    : 0

  return clamp(countScore * 0.7 + recencyBonus)
}

/** Consistency: how regular are the giving intervals? Low variance = high score. */
function computeConsistency(donations: DonationForScore[]): number {
  const dates = donations
    .map((d) => d.date)
    .filter(Boolean)
    .sort() as string[]

  if (dates.length < 3) return dates.length > 0 ? 40 : 0

  // Calculate intervals between gifts in days
  const intervals: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const diff =
      (new Date(dates[i]! + "T00:00:00Z").getTime() -
        new Date(dates[i - 1]! + "T00:00:00Z").getTime()) /
      DAY_MS
    intervals.push(diff)
  }

  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length
  if (mean === 0) return 50

  const variance =
    intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length
  const cv = Math.sqrt(variance) / mean // coefficient of variation

  // CV of 0 = perfectly regular (100), CV of 1+ = very irregular (20)
  return clamp(100 * (1 - Math.min(cv, 1)) * 0.8 + 20)
}

// ────────────────────────────────────────────────────────────────────
// Smart Ask computation
// ────────────────────────────────────────────────────────────────────

/** Calculate a suggested "next ask" amount based on giving history and trend. */
function computeSuggestedAsk(
  donations: DonationForScore[],
  trend: DonorHealthScore["trend"]
): number | null {
  const amounts = donations
    .map((d) => toNum(d.amount))
    .filter((a) => a > 0)

  if (amounts.length === 0) return null

  // Use last 5 gifts or all if fewer
  const recent = amounts.slice(-5)
  const avg = recent.reduce((s, a) => s + a, 0) / recent.length

  // Apply trend-based uplift
  let multiplier = 1.0
  if (trend === "rising") multiplier = 1.15 // 15% uplift
  else if (trend === "stable") multiplier = 1.05 // modest 5% uplift
  else if (trend === "declining") multiplier = 1.0 // no uplift
  else if (trend === "new") multiplier = 1.1 // 10% for new donors

  const suggested = avg * multiplier

  // Round to a clean number for better UX
  if (suggested < 50) return Math.ceil(suggested / 5) * 5
  if (suggested < 500) return Math.ceil(suggested / 25) * 25
  if (suggested < 5000) return Math.ceil(suggested / 100) * 100
  return Math.ceil(suggested / 500) * 500
}

// ────────────────────────────────────────────────────────────────────
// Main computation
// ────────────────────────────────────────────────────────────────────

function getLabel(score: number): ScoreLabel {
  if (score >= 80) return "Excellent"
  if (score >= 60) return "Good"
  if (score >= 40) return "Fair"
  if (score >= 20) return "At Risk"
  return "Cold"
}

/**
 * Compute the donor health score from raw data.
 * Pure function — no database calls, no side effects.
 */
export function computeDonorHealthScore(input: ScoreInput): DonorHealthScore {
  const recency = computeRecency(input.lastDonationDate)
  const frequency = computeFrequency(input.donations)
  const { score: monetary, trend: rawTrend } = computeMonetary(input.donations)
  const engagement = computeEngagement(input.interactions)
  const consistency = computeConsistency(input.donations)

  const factors: ScoreFactors = {
    recency,
    frequency,
    monetary,
    engagement,
    consistency,
  }

  const score = clamp(
    Math.round(
      recency * (WEIGHTS.recency / 100) +
        frequency * (WEIGHTS.frequency / 100) +
        monetary * (WEIGHTS.monetary / 100) +
        engagement * (WEIGHTS.engagement / 100) +
        consistency * (WEIGHTS.consistency / 100)
    )
  )

  // Override trend if score is very low
  const trend = score < 10 ? "inactive" : rawTrend

  const suggestedAsk = computeSuggestedAsk(input.donations, trend)

  return {
    score,
    label: getLabel(score),
    factors,
    suggestedAsk,
    trend,
  }
}

/** Color for the score badge in the UI. */
export function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400"
  if (score >= 60) return "text-blue-600 dark:text-blue-400"
  if (score >= 40) return "text-amber-600 dark:text-amber-400"
  if (score >= 20) return "text-orange-600 dark:text-orange-400"
  return "text-red-600 dark:text-red-400"
}

/** Background color for score indicators. */
export function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-100 dark:bg-emerald-950"
  if (score >= 60) return "bg-blue-100 dark:bg-blue-950"
  if (score >= 40) return "bg-amber-100 dark:bg-amber-950"
  if (score >= 20) return "bg-orange-100 dark:bg-orange-950"
  return "bg-red-100 dark:bg-red-950"
}
