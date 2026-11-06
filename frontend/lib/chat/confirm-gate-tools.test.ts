import { beforeEach, describe, expect, it, vi } from "vitest"

import { CLOSED_GATE, previewKey, type ConfirmGate } from "./confirm-gate"
import { buildTools } from "./tools" // vi.mock calls below are hoisted above this

/**
 * The gate inside the real create_donor / create_donation tools: a
 * confirm: true call writes only when its exact preview was approved.
 */

const inserts: Array<{ table: string; row: Record<string, unknown> }> = []

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        ilike: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () =>
          Promise.resolve({ data: { id: "d1", display_name: "Ruth Henderson" }, error: null }),
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row })
          return {
            select: () => ({ single: () => Promise.resolve({ data: { id: "new-1", display_name: row.display_name }, error: null }) }),
          }
        },
      }
      return chain
    },
  }),
}))
vi.mock("@/lib/recalc-donor-totals", () => ({ recalcDonorTotals: vi.fn() }))
vi.mock("@/lib/subscription", () => ({ isLimitExceeded: vi.fn().mockResolvedValue(false) }))
vi.mock("@/lib/geocode", () => ({ buildAddressForGeocode: () => null, geocodeAddress: vi.fn() }))


/** A gate that approves the given changes once each, like openConfirmGate does. */
function gateFor(approved: Array<[string, Record<string, unknown>]>, recordOk = true): ConfirmGate {
  const keys = new Set(approved.map(([tool, fields]) => previewKey(tool, fields)))
  return {
    record: async () => recordOk,
    consume: (tool, fields) => keys.delete(previewKey(tool, fields)),
    finalize: async () => {},
  }
}

type Exec = (input: Record<string, unknown>, opts: unknown) => Promise<Record<string, unknown>>
const run = (tools: ReturnType<typeof buildTools>, name: "create_donor" | "create_donation", input: Record<string, unknown>) =>
  (tools[name] as unknown as { execute: Exec }).execute(input, { toolCallId: "t", messages: [] })

const gift = { donor_id: "d1", amount: 250, date: "2026-11-01", payment_method: "check" }
const giftPreview = { ...gift, donor_name: "Ruth Henderson", memo: null }
const donor = { display_name: "Ruth Henderson" }
const donorPreview = {
  display_name: "Ruth Henderson",
  email: null,
  phone: null,
  billing_address: null,
  city: null,
  state: null,
  zip: null,
  donor_type: "individual",
}

beforeEach(() => {
  inserts.length = 0
})

describe("create_donation gate", () => {
  it("previews without writing", async () => {
    const out = await run(buildTools("org-1", "u-1", undefined, gateFor([])), "create_donation", gift)
    expect(out.requires_confirmation).toBe(true)
    expect(inserts).toEqual([])
  })

  it("refuses to preview when the preview can't be remembered", async () => {
    const out = await run(buildTools("org-1", "u-1", undefined, gateFor([], false)), "create_donation", gift)
    expect(out.requires_confirmation).toBeUndefined()
    expect(String(out.error)).toMatch(/Couldn't prepare/)
  })

  it("refuses confirm: true when nothing was approved (same-turn write)", async () => {
    const out = await run(buildTools("org-1", "u-1", undefined, CLOSED_GATE), "create_donation", { ...gift, confirm: true })
    expect(String(out.error)).toMatch(/Not approved yet/)
    expect(inserts).toEqual([])
  })

  it("refuses a confirmed amount that differs from the approved preview", async () => {
    const gate = gateFor([["create_donation", giftPreview]])
    const out = await run(buildTools("org-1", "u-1", undefined, gate), "create_donation", {
      ...gift,
      amount: 2500,
      confirm: true,
    })
    expect(String(out.error)).toMatch(/Not approved yet/)
    expect(inserts).toEqual([])
  })

  it("writes the approved gift exactly once", async () => {
    const tools = buildTools("org-1", "u-1", undefined, gateFor([["create_donation", giftPreview]]))
    const out = await run(tools, "create_donation", { ...gift, confirm: true })
    expect(out.success).toBe(true)
    const again = await run(tools, "create_donation", { ...gift, confirm: true })
    expect(String(again.error)).toMatch(/Not approved yet/)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ table: "donations", row: { donor_id: "d1", amount: 250 } })
  })
})

describe("create_donor gate", () => {
  it("refuses confirm: true without an approved preview", async () => {
    const out = await run(buildTools("org-1", "u-1"), "create_donor", { ...donor, confirm: true }) // no gate: fails closed
    expect(String(out.error)).toMatch(/Not approved yet/)
    expect(inserts).toEqual([])
  })

  it("writes the approved donor", async () => {
    const gate = gateFor([["create_donor", donorPreview]])
    const out = await run(buildTools("org-1", "u-1", undefined, gate), "create_donor", { ...donor, confirm: true })
    expect(out.success).toBe(true)
    expect(inserts[0]).toMatchObject({ table: "donors", row: { org_id: "org-1", display_name: "Ruth Henderson" } })
  })
})
