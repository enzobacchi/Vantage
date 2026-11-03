import { tool } from "ai"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ChatPIIRedactor, redactPIIPatterns, redactReplayedText } from "./pii-redactor"

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

describe("ChatPIIRedactor.redactToolResult — fields beyond names (audit P2)", () => {
  it("replaces street address and zip with reversible placeholders, keeps city/state", () => {
    const r = new ChatPIIRedactor()
    const out = r.redactToolResult({
      preview: {
        display_name: "Jane Smith",
        billing_address: "12 Elm Street",
        city: "Berrien Springs",
        state: "MI",
        zip: "49104",
      },
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain("12 Elm Street")
    expect(json).not.toContain("49104")
    expect(out.preview.billing_address).toMatch(/^\[ADDRESS_\d+\]$/)
    expect(out.preview.city).toBe("Berrien Springs")
    expect(out.preview.state).toBe("MI")
  })

  it("does not corrupt numbers that happen to equal an address value", () => {
    const r = new ChatPIIRedactor()
    const out = r.redactToolResult({
      preview: { zip: "5000" },
      total_revenue: 5000,
      donations: [{ amount: 5000 }],
    })
    expect(out.total_revenue).toBe(5000)
    expect(out.donations[0].amount).toBe(5000)
  })

  it("redacts every custom-field value", () => {
    const r = new ChatPIIRedactor()
    const out = r.redactToolResult({
      donor: {
        id: "d1",
        custom_fields: { spouse_name: "Mark Smith", church: "Pioneer Memorial", meta: { alumni_id: "A-77812" } },
      },
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain("Mark Smith")
    expect(json).not.toContain("Pioneer Memorial")
    expect(json).not.toContain("A-77812")
    expect(json).toContain("[CUSTOM_")
    expect(json).toContain("spouse_name") // field labels are not PII
  })

  it("redacts registered campaign/fund/category names in option fields, groups and series keys", () => {
    const r = new ChatPIIRedactor()
    r.addOptionName("fund", "Ruth Henderson Memorial Scholarship")
    r.addOptionName("campaign", "Smith Family Match")
    r.addOptionName("category", "Other")

    const out = r.redactToolResult({
      donations: [{ fund_name: "Ruth Henderson Memorial Scholarship", payment_method: "other", category_name: "Other" }],
      breakdown: [{ group: "Smith Family Match", total: 100 }],
      groups: ["Smith Family Match", "Uncategorized"],
      series: [{ bucket: "2026-01", "Smith Family Match": 100, Uncategorized: 5, total: 105 }],
    })
    const json = JSON.stringify(out)
    expect(json).not.toContain("Ruth Henderson")
    expect(json).not.toContain("Smith Family Match")
    expect(out.donations[0].fund_name).toMatch(/^\[FUND_\d+\]$/)
    expect(out.donations[0].category_name).toMatch(/^\[CATEGORY_\d+\]$/)
    expect(out.donations[0].payment_method).toBe("other") // exact, case-sensitive match only
    expect(out.groups).toContain("Uncategorized")
    expect(Object.keys(out.series[0])).toContain("total")
    expect(out.series[0].total).toBe(105)
  })

  it("leaves an option name alone outside option fields (no enum collisions)", () => {
    const r = new ChatPIIRedactor()
    r.seedOptions([
      { type: "category", name: "Active" },
      { type: "fund", name: "individual" },
    ])
    const out = r.redactToolResult({
      profile: { lifecycle_status: "Active", donor_type: "individual" },
      donors_by_lifecycle: { Active: 3 },
      breakdown: [{ group: "Active", total: 10 }],
    })
    expect(out.profile).toEqual({ lifecycle_status: "Active", donor_type: "individual" })
    expect(out.donors_by_lifecycle).toEqual({ Active: 3 })
    expect(out.breakdown[0].group).toMatch(/^\[CATEGORY_\d+\]$/)
  })

  it("numbers seeded options in the order given, so placeholders are stable across requests", () => {
    const seed = [
      { type: "fund" as const, name: "Building Fund" },
      { type: "fund" as const, name: "Scholarship Fund" },
      { type: "campaign" as const, name: "Spring Phonathon" },
    ]
    const a = new ChatPIIRedactor()
    const b = new ChatPIIRedactor()
    a.seedOptions(seed)
    b.seedOptions(seed)
    const result = { donations: [{ fund_name: "Scholarship Fund", campaign_name: "Spring Phonathon" }] }
    expect(a.redactToolResult(result)).toEqual(b.redactToolResult(result))
    expect(a.redactToolResult(result).donations[0]).toEqual({ fund_name: "[FUND_2]", campaign_name: "[CAMPAIGN_1]" })
  })

  it("pattern-redacts emails and phones in error and message text", () => {
    const r = new ChatPIIRedactor()
    const out = r.redactToolResult({
      error: "Failed to create donor: Key (email)=(ruth@example.org) already exists.",
      message: "Call 269-555-0142 to confirm",
    })
    expect(out.error).not.toContain("ruth@example.org")
    expect(out.message).not.toContain("269-555-0142")
  })

  it("pattern-redacts stray emails and phones in free-text fields but leaves ids alone", () => {
    const r = new ChatPIIRedactor()
    const id = "11111111-1111-4111-8111-111111111111"
    const out = r.redactToolResult({
      activities: [{ id, subject: "Call back at 269-555-0142 or ruth@example.org", date: "2026-07-04" }],
    })
    expect(out.activities[0].subject).not.toContain("269-555-0142")
    expect(out.activities[0].subject).not.toContain("ruth@example.org")
    expect(out.activities[0].id).toBe(id)
    expect(out.activities[0].date).toBe("2026-07-04")
  })

  it("never mutates the original result (the UI renders the raw output)", () => {
    const r = new ChatPIIRedactor()
    r.addOptionName("fund", "Building Fund")
    const raw = { donations: [{ fund_name: "Building Fund", billing_address: "1 Main St" }] }
    const snapshot = JSON.parse(JSON.stringify(raw))
    r.redactToolResult(raw)
    expect(raw).toEqual(snapshot)
  })

  it("round-trips field placeholders through tool input unredaction", () => {
    const r = new ChatPIIRedactor()
    r.addOptionName("fund", "Building Fund")
    const out = r.redactToolResult({ preview: { fund_name: "Building Fund", billing_address: "1 Main St" } })
    expect(
      r.unredactToolInput({ fund_name: out.preview.fund_name, billing_address: out.preview.billing_address, limit: 5 })
    ).toEqual({ fund_name: "Building Fund", billing_address: "1 Main St", limit: 5 })
  })
})

describe("ChatPIIRedactor.unredactToolInput", () => {
  it("restores real donor names in tool arguments so server-side lookups match", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "The Delgado Family" }])
    const placeholder = r.redactUserText("Log my visit with The Delgado Family").match(/\[DONOR_\d+\]/)?.[0]
    expect(placeholder).toBeDefined()
    expect(r.unredactToolInput({ query: placeholder, notes: [`Met ${placeholder}`] })).toEqual({
      query: "The Delgado Family",
      notes: ["Met The Delgado Family"],
    })
  })

  it("returns input unchanged when nothing is mapped", () => {
    const r = new ChatPIIRedactor()
    const input = { query: "Smith", limit: 5 }
    expect(r.unredactToolInput(input)).toEqual(input)
  })
})

describe("ChatPIIRedactor.wrapTools", () => {
  it("gives the client the raw output but the model a redacted copy, and unredacts inputs", async () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Jane Smith" }])
    r.addOptionName("fund", "Jane Smith Memorial Fund")
    const seen: unknown[] = []
    const tools = r.wrapTools({
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          seen.push(query)
          return { display_name: "Jane Smith", fund_name: "Jane Smith Memorial Fund" }
        },
      }),
    })

    const output = (await tools.lookup.execute!({ query: "[DONOR_1]" }, { toolCallId: "t1", messages: [] })) as {
      display_name: string
      fund_name: string
    }
    expect(seen).toEqual(["Jane Smith"])
    expect(output).toEqual({ display_name: "Jane Smith", fund_name: "Jane Smith Memorial Fund" })

    const modelOutput = await tools.lookup.toModelOutput!({ toolCallId: "t1", input: { query: "Jane Smith" }, output })
    const json = JSON.stringify(modelOutput)
    expect(modelOutput.type).toBe("json")
    expect(json).not.toContain("Jane Smith")
    expect(json).toContain("[DONOR_1]")
    expect(json).toContain("[FUND_1]")
  })

  it("redacts the message of an error thrown by a tool", async () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Jane Smith" }])
    const tools = r.wrapTools({
      boom: tool({
        inputSchema: z.object({}),
        execute: async (): Promise<{ ok: boolean }> => {
          throw new Error("duplicate key for Jane Smith (jane@example.org)")
        },
      }),
    })
    const error = await Promise.resolve(tools.boom.execute!({}, { toolCallId: "t1", messages: [] })).catch(
      (e: Error) => e
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("[DONOR_1]")
    expect((error as Error).message).toContain("[REDACTED_EMAIL]")
    expect((error as Error).message).not.toMatch(/Jane Smith|jane@example\.org/)
  })
})

describe("redactReplayedText", () => {
  it("redacts every earlier user/assistant text part in place, keeping part order", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Ruth Henderson", email: "ruth@example.org" }])
    const messages = [
      { role: "user", parts: [{ type: "text", text: "How is Ruth Henderson doing?" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Checking Ruth Henderson." },
          { type: "tool-get_donor_summary", output: { display_name: "Ruth Henderson" } },
          { type: "text", text: "Email ruth@example.org to thank her." },
        ],
      },
      { role: "user", parts: [{ type: "text", text: "[DONOR_1] again" }] },
    ]
    redactReplayedText(messages, r, 2)

    expect(messages[0].parts[0]).toEqual({ type: "text", text: "How is [DONOR_1] doing?" })
    expect(messages[1].parts.map((p) => p.type)).toEqual(["text", "tool-get_donor_summary", "text"])
    expect(JSON.stringify(messages[1].parts[0])).toContain("[DONOR_1]")
    expect(JSON.stringify(messages[1].parts[2])).not.toContain("ruth@example.org")
    // Tool parts are left for toModelOutput; the skipped (already-redacted) message is untouched.
    expect(messages[1].parts[1]).toEqual({ type: "tool-get_donor_summary", output: { display_name: "Ruth Henderson" } })
    expect(messages[2].parts[0]).toEqual({ type: "text", text: "[DONOR_1] again" })
  })

  it("handles legacy string content", () => {
    const r = new ChatPIIRedactor()
    r.seedFromDonors([{ display_name: "Ruth Henderson" }])
    const messages = [{ role: "assistant", content: "Ruth Henderson gave $500." }]
    redactReplayedText(messages, r, -1)
    expect(messages[0].content).toBe("[DONOR_1] gave $500.")
  })
})
