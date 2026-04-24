import { describe, expect, it } from "vitest"

import {
  buildPIIMapFromDonors,
  redactWithMap,
  redactWithMapWordBoundary,
  unredactWithMap,
  type PIIMap,
} from "./pii-helpers"

describe("buildPIIMapFromDonors", () => {
  it("assigns numbered placeholders per field", () => {
    const map = buildPIIMapFromDonors([
      {
        display_name: "Jane Smith",
        email: "jane@example.com",
        phone: "555-123-4567",
      },
      {
        display_name: "John Doe",
        email: "john@example.com",
      },
    ])
    expect(map.entries["[DONOR_1]"]).toBe("Jane Smith")
    expect(map.entries["[DONOR_2]"]).toBe("John Doe")
    expect(map.entries["[EMAIL_1]"]).toBe("jane@example.com")
    expect(map.entries["[EMAIL_2]"]).toBe("john@example.com")
    expect(map.entries["[PHONE_1]"]).toBe("555-123-4567")
  })

  it("deduplicates on value", () => {
    const map = buildPIIMapFromDonors([
      { display_name: "Jane Smith" },
      { display_name: "Jane Smith" },
    ])
    expect(Object.keys(map.entries)).toHaveLength(1)
  })
})

describe("redactWithMap (substring)", () => {
  const map: PIIMap = {
    entries: {
      "[DONOR_1]": "Jane Smith",
      "[EMAIL_1]": "jane@example.com",
    },
  }

  it("redacts matching substrings case-insensitively", () => {
    const redacted = redactWithMap("Hello JANE SMITH and jane@example.com", map)
    expect(redacted).toBe("Hello [DONOR_1] and [EMAIL_1]")
  })

  it("round-trips through unredactWithMap", () => {
    const original = "Thanks Jane Smith for your gift."
    const redacted = redactWithMap(original, map)
    expect(unredactWithMap(redacted, map)).toBe(original)
  })

  it("handles empty map", () => {
    expect(redactWithMap("unchanged", { entries: {} })).toBe("unchanged")
  })
})

describe("redactWithMapWordBoundary", () => {
  const map: PIIMap = {
    entries: {
      "[DONOR_1]": "Jane Smith",
      "[DONOR_2]": "Jane",
      "[EMAIL_1]": "jane@example.com",
      "[PHONE_1]": "(555) 123-4567",
    },
  }

  it("prefers the longest match when names overlap", () => {
    const out = redactWithMapWordBoundary("Send Jane Smith a note", map)
    expect(out).toBe("Send [DONOR_1] a note")
  })

  it("still matches the short name when the long one is absent", () => {
    const out = redactWithMapWordBoundary("Talk to Jane tomorrow", map)
    expect(out).toBe("Talk to [DONOR_2] tomorrow")
  })

  it("does not match inside a larger word", () => {
    const out = redactWithMapWordBoundary(
      "Our vendor Janeway is also named Jane",
      map
    )
    expect(out).toBe("Our vendor Janeway is also named [DONOR_2]")
  })

  it("is case-insensitive", () => {
    const out = redactWithMapWordBoundary("jane smith rsvp'd", map)
    expect(out).toBe("[DONOR_1] rsvp'd")
  })

  it("redacts values that start/end with punctuation (phone)", () => {
    const out = redactWithMapWordBoundary(
      "Call me at (555) 123-4567 tonight",
      map
    )
    expect(out).toBe("Call me at [PHONE_1] tonight")
  })

  it("redacts emails embedded in sentences", () => {
    const out = redactWithMapWordBoundary(
      "Reply to jane@example.com please",
      map
    )
    expect(out).toBe("Reply to [EMAIL_1] please")
  })

  it("skips values shorter than 3 chars to avoid false positives", () => {
    const out = redactWithMapWordBoundary("Al was here", {
      entries: { "[DONOR_1]": "Al" },
    })
    expect(out).toBe("Al was here")
  })

  it("returns input unchanged when map is empty", () => {
    expect(
      redactWithMapWordBoundary("nothing to redact", { entries: {} })
    ).toBe("nothing to redact")
  })
})
