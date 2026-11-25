import { describe, expect, it } from "vitest"

import { redactPII } from "./pii-redaction"

describe("redactPII", () => {
  it("redacts a short value (state) only as a whole word, leaving words that contain it intact", () => {
    const text = JSON.stringify({ trend: "increasing", type: "call", note: "Moved to IN last year" })
    const { redacted } = redactPII(text, { state: "IN" })
    expect(redacted).toContain('"trend":"increasing"')
    expect(redacted).toContain("Moved to [DONOR_STATE] last year")
  })

  it("does not corrupt keys or enum values that contain a 2-letter state", () => {
    const { redacted } = redactPII('{"type":"call","total_of_gifts":3}', { state: "CA" })
    expect(redacted).toBe('{"type":"call","total_of_gifts":3}')
  })

  it("still redacts longer values as substrings (e.g. a name inside a possessive)", () => {
    const { redacted } = redactPII("Visited the Hendersons' home", { name: "Henderson" })
    expect(redacted).toBe("Visited the [DONOR_NAME]s' home")
  })

  it("redacts emails and phones by pattern", () => {
    const { redacted } = redactPII("reach me at a@b.co or 901-555-0102", {})
    expect(redacted).toBe("reach me at [REDACTED_EMAIL] or [REDACTED_PHONE]")
  })
})
