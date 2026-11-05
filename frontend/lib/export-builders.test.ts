import { describe, expect, it } from "vitest"

import { buildExport } from "./export-builders"

/**
 * Minimal stand-in for the Supabase query builder. Like PostgREST, a select
 * without .range() returns at most 1,000 rows, so an unpaged export of a
 * large org comes back silently short.
 */
const POSTGREST_MAX_ROWS = 1000

type Call = { table: string; select: string; filters: Array<[string, unknown]> }

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, select: "", filters: [] }
      calls.push(call)
      const rows = tables[table] ?? []
      const page = (from: number, to: number) =>
        Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + POSTGREST_MAX_ROWS)), error: null })
      const builder = {
        select(cols: string) {
          call.select = cols
          return builder
        },
        eq(col: string, value: unknown) {
          call.filters.push([col, value])
          return builder
        },
        in(col: string, value: unknown) {
          call.filters.push([col, value])
          return builder
        },
        order() {
          return builder
        },
        range(from: number, to: number) {
          return page(from, to)
        },
        then<T>(resolve: (v: { data: Record<string, unknown>[]; error: null }) => T) {
          return page(0, rows.length).then(resolve)
        },
      }
      return builder
    },
  }
  return { client: client as unknown as Parameters<typeof buildExport>[0], calls }
}

function dataRowCount(csv: string): number {
  return csv.trim().split("\n").length - 1
}

describe("buildExport", () => {
  it("exports every donor, past PostgREST's 1,000-row cap", async () => {
    const donors = Array.from({ length: 2500 }, (_, i) => ({ id: `d${i}`, display_name: `Donor ${i}` }))
    const { client } = fakeSupabase({ donors, custom_field_definitions: [] })
    const { csv } = await buildExport(client, "org-1", "donors")
    expect(dataRowCount(csv)).toBe(2500)
  })

  it("exports every donation, including ones with no donor", async () => {
    const donations = Array.from({ length: 1500 }, (_, i) => ({
      id: `g${i}`,
      donor_id: i === 0 ? null : `d${i}`,
      amount: 10,
      donors: i === 0 ? null : { display_name: `Donor ${i}` },
    }))
    const { client, calls } = fakeSupabase({ donations })
    const { csv } = await buildExport(client, "org-1", "donations")
    expect(dataRowCount(csv)).toBe(1500)
    // An inner join would drop donations whose donor was removed.
    const select = calls.find((c) => c.table === "donations")?.select ?? ""
    expect(select).not.toContain("!inner")
    expect(calls.find((c) => c.table === "donations")?.filters).toContainEqual(["org_id", "org-1"])
  })

  it("exports every interaction, scoped to the org through its donor", async () => {
    const interactions = Array.from({ length: 1200 }, (_, i) => ({ id: `i${i}`, donor_id: `d${i}` }))
    const { client, calls } = fakeSupabase({ interactions })
    const { csv } = await buildExport(client, "org-1", "interactions")
    expect(dataRowCount(csv)).toBe(1200)
    const call = calls.find((c) => c.table === "interactions")
    expect(call?.select).toContain("donors!inner(org_id)")
    expect(call?.filters).toContainEqual(["donors.org_id", "org-1"])
  })
})
