import { fiscalYearOf, fiscalYearRange } from "@/lib/fiscal-year"

/**
 * The touchpoint meter's rules, as pure functions.
 *
 * Every donor has a meter with a capacity. Each touchpoint adds points; when
 * the meter is full it is time to make an ask. Recording the ask's outcome
 * starts a new cycle. The fill is never stored: it is carried points plus the
 * touchpoints logged since the cycle started (by when they were entered, not
 * when they happened — last week's coffee entered today still counts), so merging donors or editing and
 * deleting touchpoints stays correct with no extra bookkeeping.
 */

// ── Capacity ────────────────────────────────────────────────────────────────

export const MIN_CAPACITY = 20
const CAPACITY_STEP = 5

/**
 * Suggested capacity from a donor's best recent year of giving. Bigger givers
 * need more relationship before an ask, but not proportionally more:
 * 40 × (giving ÷ $10,000)^0.44, rounded to the nearest 5.
 * Reproduces the reference points $10k → 40, $50k → 80, $200k → 150.
 * Only a starting value; the fundraiser can always override it.
 */
export function suggestCapacity(bestYearlyGivingUsd: number): number {
  if (!Number.isFinite(bestYearlyGivingUsd) || bestYearlyGivingUsd <= 0) return MIN_CAPACITY
  const raw = 40 * Math.pow(bestYearlyGivingUsd / 10_000, 0.44)
  return Math.max(MIN_CAPACITY, Math.round(raw / CAPACITY_STEP) * CAPACITY_STEP)
}

/** Largest total given in any of the last three fiscal years (including the current one). */
export function bestYearlyGiving(
  gifts: ReadonlyArray<{ date: string | null; amount: unknown }>,
  fiscalYearStartMonth: number,
  today: Date = new Date()
): number {
  const currentFy = fiscalYearOf(today, fiscalYearStartMonth)
  let best = 0
  for (let fy = currentFy; fy > currentFy - 3; fy--) {
    const { start, end } = fiscalYearRange(fy, fiscalYearStartMonth)
    let total = 0
    for (const gift of gifts) {
      if (!gift.date) continue
      const day = gift.date.slice(0, 10)
      if (day < start || day > end) continue
      const amount = Number(gift.amount)
      if (Number.isFinite(amount)) total += amount
    }
    if (total > best) best = total
  }
  return best
}

// ── Touchpoint kinds ────────────────────────────────────────────────────────

/** The five values `interactions.type` allows. Kinds sit on top of these. */
export type BaseInteractionType = "email" | "call" | "meeting" | "note" | "task"

export type TouchpointKind = {
  key: string
  label: string
  baseType: BaseInteractionType
  points: number
}

/**
 * Defaults every organisation starts with; each can be overridden or added to.
 * Mass mailings and receipts are worth nothing so that one bulk send does not
 * fill every donor's meter.
 */
export const DEFAULT_TOUCHPOINT_KINDS: readonly TouchpointKind[] = [
  { key: "email", label: "Email", baseType: "email", points: 5 },
  { key: "text", label: "Text", baseType: "note", points: 10 },
  { key: "call", label: "Call", baseType: "call", points: 15 },
  { key: "letter", label: "Handwritten note", baseType: "note", points: 15 },
  { key: "meeting", label: "Meeting", baseType: "meeting", points: 25 },
  { key: "event", label: "Event", baseType: "meeting", points: 25 },
  { key: "coffee", label: "Coffee or meal", baseType: "meeting", points: 50 },
  { key: "visit", label: "Visit", baseType: "meeting", points: 50 },
  { key: "note", label: "Note", baseType: "note", points: 0 },
  { key: "task", label: "Task", baseType: "task", points: 0 },
  { key: "bulk_email", label: "Bulk email", baseType: "email", points: 0 },
  { key: "receipt", label: "Receipt", baseType: "email", points: 0 },
]

/** Defaults with an organisation's own kinds layered on top (matched by key). */
export function resolveTouchpointKinds(orgKinds: readonly TouchpointKind[]): TouchpointKind[] {
  const byKey = new Map<string, TouchpointKind>()
  for (const kind of DEFAULT_TOUCHPOINT_KINDS) byKey.set(kind.key, kind)
  for (const kind of orgKinds) byKey.set(kind.key, kind)
  return [...byKey.values()]
}

export function pointsForKind(kinds: readonly TouchpointKind[], key: string): number {
  const points = kinds.find((k) => k.key === key)?.points ?? 0
  return Number.isFinite(points) && points > 0 ? Math.round(points) : 0
}

// ── Meter state ─────────────────────────────────────────────────────────────

export type MeterState = {
  capacity: number
  /** Points brought into the current cycle from the previous one. */
  carriedPoints: number
  /** ISO timestamp; touchpoints logged on or after this count toward the fill. */
  cycleStartedAt: string
}

export function meterFill(
  state: MeterState,
  touchpoints: ReadonlyArray<{ loggedAt: string; points: number }>
): number {
  const cycleStart = Date.parse(state.cycleStartedAt)
  let fill = state.carriedPoints
  for (const t of touchpoints) {
    if (Date.parse(t.loggedAt) >= cycleStart) fill += t.points
  }
  return fill
}

export type MeterStatus = { fill: number; capacity: number; percent: number; ready: boolean }

export function meterStatus(state: MeterState, fill: number): MeterStatus {
  const percent = state.capacity > 0 ? Math.min(100, Math.round((fill / state.capacity) * 100)) : 0
  return { fill, capacity: state.capacity, percent, ready: fill >= state.capacity }
}

// ── Asks ────────────────────────────────────────────────────────────────────

export type AskOutcome =
  | { kind: "gave_full" }
  | { kind: "gave_partial"; amountAsked: number; amountGiven: number }
  | { kind: "declined"; adjust: "lower_meter"; newFill: number }
  | { kind: "declined"; adjust: "raise_capacity"; newCapacity: number }

/**
 * The meter after an ask. Always starts a new cycle at `now`; what is left of
 * the old fill is carried into it.
 * - gave in full: meter resets to zero
 * - gave part: the same share of the meter is used up
 * - declined: the fundraiser either lowers the meter or raises the capacity
 *   (the donor needed more relationship than the meter assumed)
 */
export function applyAskOutcome(
  state: MeterState,
  fillBefore: number,
  outcome: AskOutcome,
  now: string
): MeterState {
  const next: MeterState = { capacity: state.capacity, carriedPoints: fillBefore, cycleStartedAt: now }

  if (outcome.kind === "gave_full") {
    next.carriedPoints = 0
  } else if (outcome.kind === "gave_partial") {
    const share =
      outcome.amountAsked > 0 ? Math.min(1, Math.max(0, outcome.amountGiven / outcome.amountAsked)) : 1
    next.carriedPoints = Math.round(fillBefore * (1 - share))
  } else if (outcome.adjust === "lower_meter") {
    next.carriedPoints = Math.min(fillBefore, Math.max(0, Math.round(outcome.newFill)))
  } else {
    next.capacity = Math.max(state.capacity, Math.round(outcome.newCapacity))
  }
  return next
}
