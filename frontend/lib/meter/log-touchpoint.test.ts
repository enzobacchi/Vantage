import { describe, expect, it } from "vitest"

import { loadTouchpointKinds, logTouchpoint, type TouchpointAdmin } from "./log-touchpoint"

type KindRow = { key: string; label: string; base_type: string; points: number; archived: boolean }

/** Fake service-role client: donors by org, org kind overrides, and an interactions sink. */
function fakeAdmin(opts: {
  donors?: Record<string, string> // donorId -> orgId
  kinds?: Record<string, KindRow[]> // orgId -> rows
  failInsert?: boolean
  failKinds?: boolean
} = {}) {
  const donors = opts.donors ?? { "donor-1": "org-1" }
  const inserted: Array<Record<string, unknown>> = []
  let kindLookups = 0
  const admin = {
    from(table: string) {
      if (table === "donors") {
        const filters: Record<string, string> = {}
        const q = {
          select: () => q,
          eq: (col: string, val: string) => {
            filters[col] = val
            return q
          },
          maybeSingle: () => {
            const found = donors[filters.id] === filters.org_id
            return Promise.resolve({ data: found ? { id: filters.id } : null, error: null })
          },
        }
        return q
      }
      if (table === "org_touchpoint_kinds") {
        return {
          select: () => ({
            eq: (_col: string, orgId: string) => {
              kindLookups++
              if (opts.failKinds) return Promise.resolve({ data: null, error: { message: "kinds down" } })
              return Promise.resolve({ data: opts.kinds?.[orgId] ?? [], error: null })
            },
          }),
        }
      }
      if (table === "interactions") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                if (opts.failInsert) return Promise.resolve({ data: null, error: { message: "insert failed" } })
                inserted.push(row)
                return Promise.resolve({ data: { id: `int-${inserted.length}`, ...row }, error: null })
              },
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { admin: admin as unknown as TouchpointAdmin, inserted, kindLookups: () => kindLookups }
}

const base = { orgId: "org-1", userId: "user-1", donorId: "donor-1" }

describe("logTouchpoint", () => {
  it("logs a coffee as a meeting worth 50 points, with its author", async () => {
    const { admin, inserted } = fakeAdmin()
    const result = await logTouchpoint(admin, { ...base, kind: "coffee", content: "Her dog is sick" })
    expect(result.ok).toBe(true)
    expect(inserted[0]).toMatchObject({
      donor_id: "donor-1",
      type: "meeting",
      touchpoint_type: "coffee",
      points: 50,
      created_by: "user-1",
      content: "Her dog is sick",
      status: null,
    })
  })

  it("keeps old callers working: a bare type gets its matching kind and points", async () => {
    const { admin, inserted } = fakeAdmin()
    await logTouchpoint(admin, { ...base, type: "call", subject: "Check-in" })
    await logTouchpoint(admin, { ...base, type: "email" })
    await logTouchpoint(admin, { ...base, type: "meeting" })
    await logTouchpoint(admin, { ...base, type: "note" })
    expect(inserted.map((r) => [r.type, r.touchpoint_type, r.points])).toEqual([
      ["call", "call", 15],
      ["email", "email", 5],
      ["meeting", "meeting", 25],
      ["note", "note", 0],
    ])
  })

  it("creates tasks as pending and worth nothing", async () => {
    const { admin, inserted } = fakeAdmin()
    await logTouchpoint(admin, { ...base, type: "task", subject: "Send thank-you" })
    expect(inserted[0]).toMatchObject({ type: "task", status: "pending", points: 0 })
    await logTouchpoint(admin, { ...base, type: "task", status: "completed" })
    expect(inserted[1]).toMatchObject({ status: "completed" })
  })

  it("gives mass mailings and receipts zero points", async () => {
    const { admin, inserted } = fakeAdmin()
    await logTouchpoint(admin, { ...base, kind: "bulk_email", direction: "outbound" })
    await logTouchpoint(admin, { ...base, kind: "receipt", direction: "outbound" })
    expect(inserted.map((r) => [r.type, r.points, r.direction])).toEqual([
      ["email", 0, "outbound"],
      ["email", 0, "outbound"],
    ])
  })

  it("uses the organisation's own points and kinds", async () => {
    const { admin, inserted } = fakeAdmin({
      kinds: {
        "org-1": [
          { key: "email", label: "Email", base_type: "email", points: 8, archived: false },
          { key: "site_tour", label: "Site tour", base_type: "meeting", points: 60, archived: false },
        ],
      },
    })
    await logTouchpoint(admin, { ...base, kind: "email" })
    await logTouchpoint(admin, { ...base, kind: "site_tour" })
    expect(inserted.map((r) => [r.type, r.points])).toEqual([
      ["email", 8],
      ["meeting", 60],
    ])
  })

  it("refuses a donor from another organisation and writes nothing", async () => {
    const { admin, inserted } = fakeAdmin({ donors: { "donor-1": "org-2" } })
    const result = await logTouchpoint(admin, { ...base, kind: "coffee" })
    expect(result).toEqual({ ok: false, reason: "donor_not_found", message: "Donor not found." })
    expect(inserted).toEqual([])
  })

  it("refuses an unknown kind, a missing kind and type, and an archived kind", async () => {
    const { admin, inserted } = fakeAdmin({
      kinds: { "org-1": [{ key: "fax", label: "Fax", base_type: "note", points: 3, archived: true }] },
    })
    for (const input of [{ kind: "telepathy" }, {}, { kind: "fax" }, { type: "carrier_pigeon" as never }]) {
      const result = await logTouchpoint(admin, { ...base, ...input })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe("invalid")
    }
    expect(inserted).toEqual([])
  })

  it("reports a failed save", async () => {
    const { admin } = fakeAdmin({ failInsert: true })
    const result = await logTouchpoint(admin, { ...base, kind: "call" })
    expect(result).toMatchObject({ ok: false, reason: "db" })
  })

  it("defaults the date to now and honours a given date", async () => {
    const { admin, inserted } = fakeAdmin()
    const before = Date.now()
    await logTouchpoint(admin, { ...base, kind: "call" })
    await logTouchpoint(admin, { ...base, kind: "call", date: "2026-10-01T12:00:00.000Z" })
    expect(Date.parse(String(inserted[0].date))).toBeGreaterThanOrEqual(before)
    expect(inserted[1].date).toBe("2026-10-01T12:00:00.000Z")
  })

  it("reuses preloaded kinds so a bulk send does not look them up per recipient", async () => {
    const { admin, kindLookups } = fakeAdmin()
    const kinds = await loadTouchpointKinds(admin, "org-1")
    await logTouchpoint(admin, { ...base, kind: "bulk_email", kinds })
    await logTouchpoint(admin, { ...base, kind: "bulk_email", kinds })
    expect(kindLookups()).toBe(1)
  })

  it("falls back to the default kinds if the organisation's overrides cannot be read", async () => {
    const { admin, inserted } = fakeAdmin({ failKinds: true })
    const result = await logTouchpoint(admin, { ...base, kind: "coffee" })
    expect(result.ok).toBe(true)
    expect(inserted[0]).toMatchObject({ points: 50 })
  })
})
