import { describe, expect, it } from "vitest"

import { ChatPIIRedactor, redactPIIPatterns } from "./pii-redactor"

describe("redactPIIPatterns", () => {
  it("replaces emails and phones with stable placeholders", () => {
    const out = redactPIIPatterns("write to foo@bar.com or call 555-123-4567")
    expect(out).toContain("[REDACTED_EMAIL]")
    expect(out).toContain("[REDACTED_PHONE]")
  })
})

describe("ChatPIIRedactor.seedFromDonors + redactUserText", () => {
  it("redacts names, emails, and phones seeded from donors", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([
      {
        display_name: "Jane Smith",
        email: "jane@example.com",
        phone: "(555) 123-4567",
      },
      { display_name: "John Doe" },
    ])

    const out = r.redactUserText(
      "Follow up with Jane Smith and John Doe at jane@example.com"
    )
    expect(out).toContain("[DONOR_1]")
    expect(out).toContain("[DONOR_2]")
    expect(out).toContain("[EMAIL_1]")
    expect(out).not.toContain("Jane Smith")
    expect(out).not.toContain("John Doe")
  })

  it("catches un-seeded emails/phones via pattern fallback", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Jane Smith" }])
    const out = r.redactUserText("email random@other.com about this")
    expect(out).toContain("[REDACTED_EMAIL]")
  })

  it("prefers the longer name when two donors share a first name", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([
      { display_name: "John" },
      { display_name: "John Doe" },
    ])
    const out = r.redactUserText("Thank John Doe today")
    expect(out).toContain("[DONOR_2]")
    expect(out).not.toContain("John Doe")
  })

  it("passes through text with no PII matches", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Jane Smith" }])
    expect(r.redactUserText("what were total donations last month")).toBe(
      "what were total donations last month"
    )
  })
})

describe("ChatPIIRedactor.redactToolResult", () => {
  it("redacts donor names inside nested tool-result objects", () => {
    const r = new ChatPIIRedactor()
    const result = {
      donors: [
        { id: "1", display_name: "Jane Smith", lifetime: 5000 },
        { id: "2", display_name: "John Doe", lifetime: 1200 },
      ],
      message: "Found 2 donors",
    }
    const redacted = r.redactToolResult(result)
    const json = JSON.stringify(redacted)
    expect(json).not.toContain("Jane Smith")
    expect(json).not.toContain("John Doe")
    expect(json).toContain("[DONOR_")
  })

  it("treats `name` as PII only when adjacent to an id field", () => {
    const r = new ChatPIIRedactor()
    const result = {
      campaigns: [{ name: "Fall Appeal", total: 1000 }],
      donors: [{ id: "1", name: "Jane Smith", total: 500 }],
    }
    const redacted = r.redactToolResult(result)
    const json = JSON.stringify(redacted)
    expect(json).toContain("Fall Appeal") // campaign name preserved
    expect(json).not.toContain("Jane Smith") // guarded by id sibling
  })
})

describe("ChatPIIRedactor consistent map across user text + tool results", () => {
  it("reuses the same placeholder for a name seen in both paths", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Jane Smith" }])

    const userOut = r.redactUserText("tell me about Jane Smith")
    const toolOut = r.redactToolResult({
      donors: [{ id: "1", display_name: "Jane Smith" }],
    })

    expect(userOut).toContain("[DONOR_1]")
    expect(JSON.stringify(toolOut)).toContain("[DONOR_1]")
  })
})
