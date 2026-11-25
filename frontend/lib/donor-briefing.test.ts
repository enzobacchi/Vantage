import { describe, expect, it } from "vitest"

import { parseBriefing, summarizeGiving } from "./donor-briefing"

const placeholders = { DONOR_NAME: "Ruth Henderson", DONOR_CITY: "Troy" }

describe("parseBriefing", () => {
  it("parses a well-formed briefing and unredacts placeholders", () => {
    const raw = JSON.stringify({
      summary: "[DONOR_NAME] is a loyal monthly giver.",
      givingHistory: "Gave $2,400 across 12 gifts since 2023.",
      lastConversation: "Met in [DONOR_CITY] about the building fund.",
      talkingPoints: ["Thank them for the March gift", "Share building fund progress"],
    })
    expect(parseBriefing(raw, placeholders, true)).toEqual({
      summary: "Ruth Henderson is a loyal monthly giver.",
      givingHistory: "Gave $2,400 across 12 gifts since 2023.",
      lastConversation: "Met in Troy about the building fund.",
      talkingPoints: ["Thank them for the March gift", "Share building fund progress"],
    })
  })

  it("strips markdown fences around the JSON", () => {
    const raw = '```json\n{"summary":"Steady giver.","givingHistory":"3 gifts.","lastConversation":null,"talkingPoints":["Say thanks"]}\n```'
    expect(parseBriefing(raw, {}, false).summary).toBe("Steady giver.")
  })

  it("forces lastConversation to null when the donor has no interactions", () => {
    const raw = JSON.stringify({
      summary: "s",
      givingHistory: "g",
      lastConversation: "They mentioned a trip to Italy.",
      talkingPoints: [],
    })
    expect(parseBriefing(raw, {}, false).lastConversation).toBeNull()
  })

  it("coerces missing and wrongly-typed fields", () => {
    const raw = JSON.stringify({ summary: 42, talkingPoints: ["ok", 7, null, "  ", "fine"] })
    expect(parseBriefing(raw, {}, true)).toEqual({
      summary: "",
      givingHistory: "",
      lastConversation: null,
      talkingPoints: ["ok", "fine"],
    })
  })

  it("caps talking points at five", () => {
    const raw = JSON.stringify({ talkingPoints: ["1", "2", "3", "4", "5", "6", "7"] })
    expect(parseBriefing(raw, {}, true).talkingPoints).toHaveLength(5)
  })

  it("falls back to the raw text as the summary when the reply is not JSON", () => {
    expect(parseBriefing("[DONOR_NAME] gives often.", placeholders, true)).toEqual({
      summary: "Ruth Henderson gives often.",
      givingHistory: "",
      lastConversation: null,
      talkingPoints: [],
    })
  })
})

describe("summarizeGiving", () => {
  it("computes totals, range, and a declining trend from newest-first gifts", () => {
    const gifts = [
      { amount: 300, date: "2026-05-30" },
      { amount: 425, date: "2026-03-21" },
      { amount: 550, date: "2026-01-10" },
    ]
    expect(summarizeGiving(gifts)).toEqual({
      gift_count: 3,
      total_of_gifts: 1275,
      largest_gift: 550,
      first_gift_date: "2026-01-10",
      last_gift_date: "2026-05-30",
      last_gift_amount: 300,
      trend: "declining",
    })
  })

  it("reports an increasing trend and tolerates string amounts", () => {
    const gifts = [
      { amount: "500", date: "2026-04-01" },
      { amount: "450", date: "2026-02-01" },
      { amount: "100", date: "2025-12-01" },
      { amount: "100", date: "2025-10-01" },
    ]
    expect(summarizeGiving(gifts).trend).toBe("increasing")
  })

  it("calls a single gift 'single gift' and no gifts 'none'", () => {
    expect(summarizeGiving([{ amount: 50, date: "2026-01-01" }]).trend).toBe("single gift")
    expect(summarizeGiving([])).toEqual({
      gift_count: 0,
      total_of_gifts: 0,
      largest_gift: null,
      first_gift_date: null,
      last_gift_date: null,
      last_gift_amount: null,
      trend: "none",
    })
  })
})
