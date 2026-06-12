import { describe, expect, it } from "vitest"
import { encodeCursor, decodeCursor } from "./api-cursor"

// The decoded cursor is interpolated into a PostgREST .or() filter string, so
// decodeCursor must reject anything that isn't an ISO timestamp + UUID
// (regression guard for the filter-injection fix).
describe("decodeCursor", () => {
  it("round-trips a valid timestamp + uuid cursor", () => {
    const ts = "2026-06-12T14:00:00.000Z"
    const id = "11111111-2222-3333-4444-555555555555"
    const decoded = decodeCursor(encodeCursor(ts, id))
    expect(decoded).toEqual({ createdAt: ts, id })
  })

  it("rejects a cursor whose id is not a UUID", () => {
    const evil = Buffer.from("2026-06-12T14:00:00Z|id.lt.0,total.gte.0").toString("base64url")
    expect(decodeCursor(evil)).toBeNull()
  })

  it("rejects a cursor whose timestamp carries injected filter syntax", () => {
    const evil = Buffer.from(
      "2026-01-01,or(total.gte.0)|11111111-2222-3333-4444-555555555555"
    ).toString("base64url")
    expect(decodeCursor(evil)).toBeNull()
  })

  it("rejects malformed base64 / missing separator", () => {
    expect(decodeCursor("not-base64-at-all!!")).toBeNull()
    expect(decodeCursor(Buffer.from("noseparator").toString("base64url"))).toBeNull()
  })
})
