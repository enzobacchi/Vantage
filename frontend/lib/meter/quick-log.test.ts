import { describe, expect, it } from "vitest"

import { UNDO_WINDOW_MS, canUndoTouchpoint, parseQuickLogInput, quickLogKinds } from "./quick-log"
import { resolveTouchpointKinds } from "./rules"

const DONOR = "118844fa-c09a-4217-bb71-cbebdb2332ae"

describe("parseQuickLogInput", () => {
  it("accepts a donor and a kind, with an optional trimmed note", () => {
    expect(parseQuickLogInput({ donorId: DONOR, kind: "coffee" })).toEqual({ donorId: DONOR, kind: "coffee", note: "" })
    expect(parseQuickLogInput({ donorId: DONOR, kind: "text", note: "  Her dog is sick  " })).toEqual({
      donorId: DONOR,
      kind: "text",
      note: "Her dog is sick",
    })
  })

  it("drops anything else in the payload, including an organisation or author", () => {
    expect(
      parseQuickLogInput({ donorId: DONOR, kind: "call", orgId: "other", userId: "someone", points: 9999, date: "1999-01-01" })
    ).toEqual({ donorId: DONOR, kind: "call", note: "" })
  })

  it("rejects bad input", () => {
    for (const bad of [
      null,
      {},
      { donorId: "not-a-uuid", kind: "call" },
      { donorId: DONOR },
      { donorId: DONOR, kind: "" },
      { donorId: DONOR, kind: "x".repeat(80) },
      { donorId: DONOR, kind: "call", note: 5 },
      { donorId: DONOR, kind: "call", note: "x".repeat(6000) },
    ]) {
      expect(parseQuickLogInput(bad)).toBeNull()
    }
  })
})

describe("quickLogKinds", () => {
  it("offers the relationship kinds, biggest first, and leaves out tasks and system entries", () => {
    const keys = quickLogKinds(resolveTouchpointKinds([])).map((k) => k.key)
    expect(keys).not.toContain("task")
    expect(keys).not.toContain("bulk_email")
    expect(keys).not.toContain("receipt")
    expect(keys).toEqual(expect.arrayContaining(["email", "text", "call", "coffee", "visit", "note"]))
    expect(keys.indexOf("email")).toBeLessThan(keys.indexOf("coffee"))
  })
})

describe("canUndoTouchpoint", () => {
  const now = Date.parse("2026-11-25T12:00:00Z")
  const row = { createdBy: "user-1", createdAt: "2026-11-25T11:58:00Z" }

  it("lets the person who logged it undo it shortly afterwards", () => {
    expect(canUndoTouchpoint(row, "user-1", now)).toBe(true)
  })

  it("refuses someone else's touchpoint, an old one, and one with no author", () => {
    expect(canUndoTouchpoint(row, "user-2", now)).toBe(false)
    expect(canUndoTouchpoint({ ...row, createdAt: new Date(now - UNDO_WINDOW_MS - 1000).toISOString() }, "user-1", now)).toBe(false)
    expect(canUndoTouchpoint({ ...row, createdBy: null }, "user-1", now)).toBe(false)
  })
})
