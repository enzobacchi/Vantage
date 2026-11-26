import { describe, expect, it } from "vitest"

import { generateSampleOrg } from "./generate"

const TODAY = new Date("2026-11-25T12:00:00Z")
const opts = { seed: 7, today: TODAY, orgId: "00000000-0000-4000-8000-000000000001" }

describe("generateSampleOrg", () => {
  const data = generateSampleOrg(opts)

  it("is deterministic for a given seed", () => {
    expect(generateSampleOrg(opts)).toEqual(data)
    expect(generateSampleOrg({ ...opts, seed: 8 }).donors[0].display_name).not.toBe(
      data.donors[0].display_name
    )
  })

  it("creates 3,000 donors by default, all in the org, with unique ids", () => {
    expect(data.donors).toHaveLength(3000)
    expect(new Set(data.donors.map((d) => d.id)).size).toBe(3000)
    expect(data.donors.every((d) => d.org_id === opts.orgId)).toBe(true)
    const types = new Set(["individual", "corporate", "school", "church"])
    expect(data.donors.every((d) => types.has(d.donor_type))).toBe(true)
  })

  it("only references donors that exist, with dates inside the three-year window", () => {
    const ids = new Set(data.donors.map((d) => d.id))
    const earliest = "2024-01-01"
    const latest = "2026-11-25"
    for (const g of data.donations) {
      expect(ids.has(g.donor_id)).toBe(true)
      expect(g.org_id).toBe(opts.orgId)
      expect(g.amount).toBeGreaterThan(0)
      expect(g.date >= earliest && g.date <= latest).toBe(true)
    }
    for (const i of data.interactions) expect(ids.has(i.donor_id)).toBe(true)
    for (const o of data.opportunities) expect(ids.has(o.donor_id)).toBe(true)
  })

  it("keeps each donor's stored totals equal to their gifts", () => {
    const sum = new Map<string, { total: number; last: string; lastAmount: number }>()
    for (const g of data.donations) {
      const s = sum.get(g.donor_id) ?? { total: 0, last: "", lastAmount: 0 }
      s.total += g.amount
      if (g.date >= s.last) {
        s.last = g.date
        s.lastAmount = g.amount
      }
      sum.set(g.donor_id, s)
    }
    for (const d of data.donors) {
      const s = sum.get(d.id)
      expect(d.total_lifetime_value).toBeCloseTo(s?.total ?? 0, 2)
      expect(d.last_donation_date).toBe(s?.last || null)
    }
  })

  it("is shaped like a mid-size nonprofit: ~2,800 gifts a year, well past the 1,000-row cap", () => {
    const in2025 = data.donations.filter((g) => g.date.startsWith("2025")).length
    expect(in2025).toBeGreaterThan(2400)
    expect(in2025).toBeLessThan(3200)
    const givers = new Set(data.donations.map((g) => g.donor_id))
    expect(givers.size).toBeGreaterThan(1500)
  })

  it("includes the three whiteboard-style major donors at $200k, $50k and $10k a year", () => {
    const yearly = (id: string) =>
      data.donations.filter((g) => g.donor_id === id && g.date.startsWith("2025")).reduce((a, g) => a + g.amount, 0)
    const [a, b, c] = data.majorDonorIds.map(yearly)
    expect(a).toBe(200_000)
    expect(b).toBe(50_000)
    expect(c).toBe(10_000)
  })

  it("only uses values the database constraints allow", () => {
    const interactionTypes = new Set(["email", "call", "meeting", "note", "task"])
    const methods = new Set(["check", "cash", "online", "ach", "credit_card", "daf", "wire"])
    const optionTypes = new Set(["category", "campaign", "fund"])
    const optionIds = new Set(data.options.map((o) => o.id))
    expect(data.interactions.every((i) => interactionTypes.has(i.type))).toBe(true)
    expect(data.interactions.length).toBeGreaterThan(1000)
    expect(data.donations.every((g) => methods.has(g.payment_method))).toBe(true)
    expect(data.options.every((o) => optionTypes.has(o.type))).toBe(true)
    expect(data.donations.every((g) => g.campaign_id === null || optionIds.has(g.campaign_id))).toBe(true)
  })
})
