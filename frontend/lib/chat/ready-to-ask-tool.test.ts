import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ReadyToAskRow } from "@/lib/meter/service"

import { buildTools } from "./tools"

const calls: Array<{ orgId: string; opts: { assignedTo?: string | null } }> = []
let rows: ReadyToAskRow[] = []
let fail = false

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }))
vi.mock("@/lib/meter/service", () => ({
  listReadyToAsk: async (_admin: unknown, orgId: string, opts: { assignedTo?: string | null }) => {
    calls.push({ orgId, opts })
    if (fail) throw new Error("boom")
    return rows
  },
}))

const row = (name: string, fill: number, capacity: number): ReadyToAskRow => ({
  donorId: `id-${name}`,
  name,
  fill,
  capacity,
  percent: Math.min(100, Math.round((fill / capacity) * 100)),
  ready: fill >= capacity,
  assignedTo: null,
  lastDonationDate: "2026-05-01",
})

type Exec = (input: Record<string, unknown>, opts: unknown) => Promise<Record<string, unknown>>
const run = (input: Record<string, unknown> = {}) => {
  const tools = buildTools("org-a", "user-1", undefined, undefined, { meter: true }) as unknown as Record<
    string,
    { execute: Exec }
  >
  return tools.get_ready_to_ask.execute(input, { toolCallId: "t", messages: [] })
}

beforeEach(() => {
  calls.length = 0
  fail = false
  rows = [row("Matt", 50, 40), row("Vanessa", 150, 150), row("John", 60, 80), row("Dana", 5, 40)]
})

describe("get_ready_to_ask", () => {
  it("only exists when the organisation has the meter switched on", () => {
    expect("get_ready_to_ask" in buildTools("org-a", "user-1")).toBe(false)
    expect("get_ready_to_ask" in buildTools("org-a", "user-1", undefined, undefined, { meter: true })).toBe(true)
  })

  it("lists donors fullest first with counts, scoped to the session's organisation", async () => {
    const out = await run()
    expect(calls).toEqual([{ orgId: "org-a", opts: {} }])
    expect(out).toMatchObject({ ready_count: 2, close_count: 2, returned: 4 })
    expect((out.donors as Array<Record<string, unknown>>)[0]).toEqual({
      donor_id: "id-Matt",
      donor_name: "Matt",
      meter_fill: 50,
      meter_capacity: 40,
      percent_full: 100,
      ready_to_ask: true,
      last_donation_date: "2026-05-01",
    })
  })

  it("can return only donors whose meter is full, and respects the limit", async () => {
    const full = await run({ only_ready: true })
    expect((full.donors as unknown[]).length).toBe(2)
    const limited = await run({ limit: 1 })
    expect(limited).toMatchObject({ returned: 1, ready_count: 2 })
  })

  it("narrows to the signed-in user's own donors — never an id the model supplies", async () => {
    await run({ mine: true, assigned_to: "someone-else" })
    expect(calls[0].opts).toEqual({ assignedTo: "user-1" })
  })

  it("reports a failure instead of an empty list", async () => {
    fail = true
    expect(await run()).toEqual({ error: "Failed to load the ready-to-ask list." })
  })
})
