import { describe, expect, it } from "vitest"

import { fetchAllByIds, fetchAllRows } from "./fetch-all"

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

describe("fetchAllByIds", () => {
  it("splits a long id list into chunks and returns every match", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const chunks: number[] = []
    const rows = await fetchAllByIds(ids, async (chunk, from) => {
      if (from === 0) chunks.push(chunk.length)
      return { data: from === 0 ? chunk.map((id) => ({ id })) : [], error: null }
    })
    expect(chunks).toEqual([200, 200, 50])
    expect(rows).toHaveLength(450)
  })

  it("pages within a chunk that matches more than 1000 rows", async () => {
    const perChunk = Array.from({ length: 2300 }, (_, i) => ({ i }))
    const rows = await fetchAllByIds(["a"], async (_chunk, from, to) => ({
      data: perChunk.slice(from, to + 1),
      error: null,
    }))
    expect(rows).toHaveLength(2300)
  })

  it("asks for each id once and makes no request for an empty list", async () => {
    let calls = 0
    const rows = await fetchAllByIds(["a", "a", "b"], async (chunk) => {
      calls++
      return { data: chunk.map((id) => ({ id })), error: null }
    })
    expect(rows).toEqual([{ id: "a" }, { id: "b" }])
    expect(await fetchAllByIds([], async () => ({ data: [], error: null }))).toEqual([])
    expect(calls).toBe(1)
  })

  it("throws when any chunk fails", async () => {
    await expect(
      fetchAllByIds(["a"], async () => ({ data: null, error: { message: "nope" } }))
    ).rejects.toThrow("nope")
  })
})
