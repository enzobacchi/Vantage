import { describe, expect, it } from "vitest"

import {
  DEFAULT_TOUCHPOINT_KINDS,
  MIN_CAPACITY,
  applyAskOutcome,
  bestYearlyGiving,
  meterFill,
  meterStatus,
  pointsForKind,
  resolveTouchpointKinds,
  suggestCapacity,
  type MeterState,
} from "./rules"

const meter = (over: Partial<MeterState> = {}): MeterState => ({
  capacity: 150,
  carriedPoints: 0,
  cycleStartedAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

describe("suggestCapacity — the whiteboard examples", () => {
  it("Vanessa, $200,000 a year → 150", () => expect(suggestCapacity(200_000)).toBe(150))
  it("John, $50,000 a year → 80", () => expect(suggestCapacity(50_000)).toBe(80))
  it("Matt, $10,000 a year → 40", () => expect(suggestCapacity(10_000)).toBe(40))

  it("never goes below the floor, including for no giving history", () => {
    expect(suggestCapacity(0)).toBe(MIN_CAPACITY)
    expect(suggestCapacity(250)).toBe(MIN_CAPACITY)
    expect(suggestCapacity(Number.NaN)).toBe(MIN_CAPACITY)
    expect(suggestCapacity(-500)).toBe(MIN_CAPACITY)
  })

  it("is always a multiple of 5 and grows with giving", () => {
    let previous = 0
    for (const giving of [1_000, 5_000, 25_000, 100_000, 500_000, 2_000_000]) {
      const capacity = suggestCapacity(giving)
      expect(capacity % 5).toBe(0)
      expect(capacity).toBeGreaterThanOrEqual(previous)
      previous = capacity
    }
  })
})

describe("bestYearlyGiving", () => {
  const today = new Date("2026-11-25T12:00:00Z")

  it("takes the best of the last three calendar years", () => {
    const gifts = [
      { date: "2026-03-01", amount: 10_000 },
      { date: "2025-06-01", amount: 30_000 },
      { date: "2025-12-31", amount: 20_000 },
      { date: "2024-01-01", amount: 5_000 },
    ]
    expect(bestYearlyGiving(gifts, 1, today)).toBe(50_000)
  })

  it("ignores gifts older than three fiscal years", () => {
    const gifts = [
      { date: "2023-12-31", amount: 900_000 },
      { date: "2024-02-01", amount: 1_000 },
    ]
    expect(bestYearlyGiving(gifts, 1, today)).toBe(1_000)
  })

  it("groups by the organisation's fiscal year (July start)", () => {
    // FY2026 runs Jul 2026 – Jun 2027; FY2025 runs Jul 2025 – Jun 2026.
    const gifts = [
      { date: "2025-12-15", amount: 40_000 },
      { date: "2026-06-30", amount: 40_000 },
      { date: "2026-07-01", amount: 10_000 },
    ]
    expect(bestYearlyGiving(gifts, 7, today)).toBe(80_000)
  })

  it("is zero with no gifts, and tolerates string amounts and bad rows", () => {
    expect(bestYearlyGiving([], 1, today)).toBe(0)
    expect(
      bestYearlyGiving(
        [
          { date: "2026-01-05", amount: "2500.50" },
          { date: null, amount: 99_999 },
          { date: "2026-02-05", amount: "not a number" },
        ],
        1,
        today
      )
    ).toBe(2500.5)
  })
})

describe("touchpoint kinds and points", () => {
  it("uses the whiteboard defaults: email 5, text 10, coffee 50", () => {
    const kinds = resolveTouchpointKinds([])
    expect(pointsForKind(kinds, "email")).toBe(5)
    expect(pointsForKind(kinds, "text")).toBe(10)
    expect(pointsForKind(kinds, "coffee")).toBe(50)
  })

  it("counts mass mailings and receipts as zero so they don't fill every meter", () => {
    const kinds = resolveTouchpointKinds([])
    expect(pointsForKind(kinds, "bulk_email")).toBe(0)
    expect(pointsForKind(kinds, "receipt")).toBe(0)
  })

  it("maps every default kind onto one of the five stored interaction types", () => {
    for (const kind of DEFAULT_TOUCHPOINT_KINDS) {
      expect(["email", "call", "meeting", "note", "task"]).toContain(kind.baseType)
    }
  })

  it("lets an organisation override points and add its own kinds", () => {
    const kinds = resolveTouchpointKinds([
      { key: "email", label: "Email", baseType: "email", points: 8 },
      { key: "site_tour", label: "Site tour", baseType: "meeting", points: 60 },
    ])
    expect(pointsForKind(kinds, "email")).toBe(8)
    expect(pointsForKind(kinds, "site_tour")).toBe(60)
    expect(pointsForKind(kinds, "text")).toBe(10)
  })

  it("gives an unknown kind zero points", () => {
    expect(pointsForKind(resolveTouchpointKinds([]), "nope")).toBe(0)
  })
})

describe("meterFill", () => {
  it("adds up touchpoints since the cycle started, plus carried points", () => {
    const fill = meterFill(meter({ carriedPoints: 20 }), [
      { loggedAt: "2026-02-01T10:00:00Z", points: 5 },
      { loggedAt: "2026-03-01T10:00:00Z", points: 10 },
      { loggedAt: "2026-04-01T10:00:00Z", points: 50 },
    ])
    expect(fill).toBe(85)
  })

  it("ignores touchpoints from before the cycle started", () => {
    const fill = meterFill(meter({ cycleStartedAt: "2026-03-15T00:00:00Z" }), [
      { loggedAt: "2026-03-14T23:59:59Z", points: 50 },
      { loggedAt: "2026-03-15T00:00:00Z", points: 10 },
    ])
    expect(fill).toBe(10)
  })

  it("is ready at capacity and reports overflow honestly", () => {
    const state = meter({ capacity: 40 })
    expect(meterStatus(state, 35)).toEqual({ fill: 35, capacity: 40, percent: 88, ready: false })
    expect(meterStatus(state, 40)).toEqual({ fill: 40, capacity: 40, percent: 100, ready: true })
    expect(meterStatus(state, 95)).toEqual({ fill: 95, capacity: 40, percent: 100, ready: true })
  })
})

describe("applyAskOutcome", () => {
  const now = "2026-11-25T15:00:00.000Z"

  it("gave in full → meter resets to zero and a new cycle starts", () => {
    const next = applyAskOutcome(meter(), 150, { kind: "gave_full" }, now)
    expect(next).toEqual({ capacity: 150, carriedPoints: 0, cycleStartedAt: now })
  })

  it("gave part of the ask → drains the same share of the meter", () => {
    // Asked 100,000, gave 25,000: a quarter of the meter is used up.
    const next = applyAskOutcome(meter(), 120, { kind: "gave_partial", amountAsked: 100_000, amountGiven: 25_000 }, now)
    expect(next).toEqual({ capacity: 150, carriedPoints: 90, cycleStartedAt: now })
  })

  it("treats a partial gift at or above the ask as a full reset", () => {
    const next = applyAskOutcome(meter(), 120, { kind: "gave_partial", amountAsked: 10_000, amountGiven: 12_000 }, now)
    expect(next.carriedPoints).toBe(0)
  })

  it("declined, lower the meter → fill drops to the chosen value", () => {
    const next = applyAskOutcome(meter(), 150, { kind: "declined", adjust: "lower_meter", newFill: 75 }, now)
    expect(next).toEqual({ capacity: 150, carriedPoints: 75, cycleStartedAt: now })
  })

  it("declined, raise the capacity → fill is kept, capacity grows", () => {
    const next = applyAskOutcome(meter(), 150, { kind: "declined", adjust: "raise_capacity", newCapacity: 190 }, now)
    expect(next).toEqual({ capacity: 190, carriedPoints: 150, cycleStartedAt: now })
  })

  it("never raises the fill or shrinks the capacity on a declined ask", () => {
    const lowered = applyAskOutcome(meter(), 100, { kind: "declined", adjust: "lower_meter", newFill: 400 }, now)
    expect(lowered.carriedPoints).toBe(100)
    const raised = applyAskOutcome(meter(), 100, { kind: "declined", adjust: "raise_capacity", newCapacity: 10 }, now)
    expect(raised.capacity).toBe(150)
  })

  it("keeps a new cycle consistent: fill right after the ask equals carried points", () => {
    const next = applyAskOutcome(meter(), 120, { kind: "gave_partial", amountAsked: 100_000, amountGiven: 50_000 }, now)
    expect(meterFill(next, [{ loggedAt: "2026-11-25T14:59:00Z", points: 50 }])).toBe(60)
  })
})
