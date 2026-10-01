import { describe, expect, it } from "vitest"

import { getDigestWindow } from "./digest-window"

describe("getDigestWindow", () => {
  it("covers the 7 full days before the run day (end exclusive)", () => {
    // Monday 2026-09-28 14:00 UTC — the cron's scheduled time.
    const w = getDigestWindow(new Date("2026-09-28T14:00:00Z"))
    expect(w).toEqual({
      start: "2026-09-21",
      end: "2026-09-28",
      prevStart: "2026-09-14",
    })
  })

  it("consecutive weekly runs tile without overlap or gaps", () => {
    const a = getDigestWindow(new Date("2026-09-21T14:00:00Z"))
    const b = getDigestWindow(new Date("2026-09-28T14:00:00Z"))
    expect(a.end).toBe(b.start)
    expect(b.prevStart).toBe(a.start)
  })

  it("crosses month and year boundaries", () => {
    expect(getDigestWindow(new Date("2027-01-04T14:00:00Z"))).toEqual({
      start: "2026-12-28",
      end: "2027-01-04",
      prevStart: "2026-12-21",
    })
  })
})
