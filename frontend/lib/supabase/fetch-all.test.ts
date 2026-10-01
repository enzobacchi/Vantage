import { describe, expect, it } from "vitest"

import { fetchAllRows } from "./fetch-all"

function pager(total: number) {
  const calls: Array<[number, number]> = []
  const rows = Array.from({ length: total }, (_, i) => ({ i }))
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { calls, fetchPage }
}

describe("fetchAllRows", () => {
  it("returns every row past the 1000-row page cap", async () => {
    const { calls, fetchPage } = pager(2500)
    const all = await fetchAllRows(fetchPage)
    expect(all).toHaveLength(2500)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it("makes one extra call when the total is an exact multiple of the page", async () => {
    const { calls, fetchPage } = pager(1000)
    expect(await fetchAllRows(fetchPage)).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it("throws on a query error instead of returning a partial total", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: "boom" } }))
    ).rejects.toThrow("boom")
  })
})
