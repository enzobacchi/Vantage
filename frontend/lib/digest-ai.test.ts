import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { findFirstTimeDonorIds } from "./digest-ai"

type Gift = { donor_id: string; date: string }

/** Minimal stand-in for the donations query chain used by findFirstTimeDonorIds. */
function fakeAdmin(gifts: Gift[], opts: { fail?: boolean } = {}) {
  const inCalls: string[][] = []
  const admin = {
    from: () => {
      let ids: string[] = []
      let before = ""
      const q = {
        select: () => q,
        eq: () => q,
        in: (_col: string, v: string[]) => {
          ids = v
          inCalls.push(v)
          return q
        },
        lt: (_col: string, v: string) => {
          before = v
          return q
        },
        order: () => q,
        range: async (from: number, to: number) =>
          opts.fail
            ? { data: null, error: { message: "URI too long" } }
            : {
                data: gifts
                  .filter((g) => ids.includes(g.donor_id) && g.date < before)
                  .slice(from, to + 1)
                  .map((g) => ({ donor_id: g.donor_id })),
                error: null,
              },
      }
      return q
    },
  }
  return { admin: admin as unknown as SupabaseClient, inCalls }
}

describe("findFirstTimeDonorIds", () => {
  it("returns donors with no gift before the window", async () => {
    const { admin } = fakeAdmin([
      { donor_id: "a", date: "2026-01-05" },
      { donor_id: "b", date: "2026-09-22" },
    ])
    const result = await findFirstTimeDonorIds(admin, "org", ["a", "b", "c"], "2026-09-21")
    expect([...result].sort()).toEqual(["b", "c"])
  })

  it("ignores null and duplicate donor ids", async () => {
    const { admin, inCalls } = fakeAdmin([])
    const result = await findFirstTimeDonorIds(admin, "org", ["a", null, "a"], "2026-09-21")
    expect([...result]).toEqual(["a"])
    expect(inCalls).toEqual([["a"]])
  })

  it("chunks large id lists to keep the request URL short", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `d${i}`)
    const { admin, inCalls } = fakeAdmin([])
    await findFirstTimeDonorIds(admin, "org", ids, "2026-09-21")
    expect(inCalls.map((c) => c.length)).toEqual([100, 100, 50])
  })

  it("throws on a read error instead of counting everyone as new", async () => {
    const { admin } = fakeAdmin([], { fail: true })
    await expect(
      findFirstTimeDonorIds(admin, "org", ["a"], "2026-09-21")
    ).rejects.toThrow("URI too long")
  })
})
