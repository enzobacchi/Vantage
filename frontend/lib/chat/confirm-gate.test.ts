import { describe, expect, it } from "vitest"

import { CLOSED_GATE, PREVIEW_TTL_MS, openConfirmGate, previewKey } from "./confirm-gate"

const preview = {
  donor_id: "d1",
  donor_name: "The Delgados",
  amount: 250,
  date: "2026-10-29",
  payment_method: "check",
  memo: null,
}

type Row = {
  org_id: string
  user_id: string
  request_id: string
  key_hash: string
  ready: boolean
  expires_at: string
}

/**
 * In-memory chat_pending_writes supporting what the gate uses: insert,
 * delete with eq / in / or("ready.eq.true,expires_at.lt.<iso>") + select,
 * and update().eq().
 */
function fakeAdmin(opts: { failOpen?: boolean; failInsert?: boolean } = {}) {
  let rows: Row[] = []
  const admin = {
    from() {
      const preds: Array<(r: Row) => boolean> = []
      const matching = () => rows.filter((r) => preds.every((p) => p(r)))
      let patch: Partial<Row> | null = null
      let isOpen = false
      const chain = {
        eq(col: keyof Row, v: unknown) {
          preds.push((r) => r[col] === v)
          return chain
        },
        in(col: keyof Row, vs: unknown[]) {
          preds.push((r) => vs.includes(r[col]))
          return chain
        },
        or(expr: string) {
          isOpen = true
          const iso = expr.split("expires_at.lt.")[1]
          preds.push((r) => r.ready || r.expires_at < iso)
          return chain
        },
        select() {
          if (opts.failOpen && isOpen) return Promise.resolve({ data: null, error: { message: "delete failed" } })
          const hit = matching()
          rows = rows.filter((r) => !hit.includes(r))
          return Promise.resolve({ data: hit, error: null })
        },
        then<T>(resolve: (v: { error: null }) => T) {
          // Awaited directly: a delete without select, or an update.
          const hit = matching()
          if (patch) hit.forEach((r) => Object.assign(r, patch))
          else rows = rows.filter((r) => !hit.includes(r))
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return {
        insert(row: Omit<Row, "ready">) {
          if (opts.failInsert) return Promise.resolve({ error: { message: "insert failed" } })
          rows.push({ ready: false, ...row })
          return Promise.resolve({ error: null })
        },
        delete: () => chain,
        update(values: Partial<Row>) {
          patch = values
          return chain
        },
      }
    },
  }
  return { admin: admin as unknown as Parameters<typeof openConfirmGate>[0], rows: () => rows }
}

const ctx = (requestId: string, extra: Partial<{ orgId: string; userId: string; now: Date }> = {}) => ({
  orgId: "org-1",
  userId: "u-1",
  requestId,
  ...extra,
})

/** One finished chat request that showed `preview`. */
async function previewedIn(admin: Parameters<typeof openConfirmGate>[0], requestId: string, fields = preview) {
  const gate = await openConfirmGate(admin, ctx(requestId))
  await gate.record("create_donation", fields)
  await gate.finalize()
}

describe("previewKey", () => {
  it("ignores display-only fields, confirm, and key order", () => {
    const a = previewKey("create_donation", preview)
    const b = previewKey("create_donation", {
      confirm: true,
      memo: null,
      payment_method: "check",
      date: "2026-10-29",
      amount: 250,
      donor_id: "d1",
    })
    expect(a).toBe(b)
  })

  it("treats surrounding whitespace and undefined/null alike", () => {
    expect(previewKey("create_donor", { display_name: " Ruth ", email: undefined })).toBe(
      previewKey("create_donor", { display_name: "Ruth", email: null })
    )
  })

  it("changes when any written field or the tool changes", () => {
    expect(previewKey("create_donation", preview)).not.toBe(previewKey("create_donation", { ...preview, amount: 2500 }))
    expect(previewKey("create_donation", preview)).not.toBe(previewKey("create_donor", preview))
  })
})

describe("openConfirmGate", () => {
  it("approves a change previewed in an earlier finished request, once", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    const gate = await openConfirmGate(admin, ctx("r2"))
    expect(gate.consume("create_donation", preview)).toBe(true)
    expect(gate.consume("create_donation", preview)).toBe(false)
  })

  it("never approves a preview from the same request", async () => {
    const { admin } = fakeAdmin()
    const gate = await openConfirmGate(admin, ctx("r1"))
    await gate.record("create_donation", preview)
    expect(gate.consume("create_donation", preview)).toBe(false)
  })

  it("leaves a request still in flight alone (second tab, double-tap)", async () => {
    const { admin } = fakeAdmin()
    const inFlight = await openConfirmGate(admin, ctx("r1"))
    await inFlight.record("create_donation", preview)

    const overlapping = await openConfirmGate(admin, ctx("r2"))
    expect(overlapping.consume("create_donation", preview)).toBe(false)

    await inFlight.finalize()
    const reply = await openConfirmGate(admin, ctx("r3"))
    expect(reply.consume("create_donation", preview)).toBe(true)
  })

  it("does not re-arm a change written and re-previewed in the same request", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    const confirmTurn = await openConfirmGate(admin, ctx("r2"))
    expect(confirmTurn.consume("create_donation", preview)).toBe(true)
    await confirmTurn.record("create_donation", preview) // model shows it again
    await confirmTurn.finalize()

    const later = await openConfirmGate(admin, ctx("r3"))
    expect(later.consume("create_donation", preview)).toBe(false)
  })

  it("drops a written change even if it was re-previewed before the write", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    const confirmTurn = await openConfirmGate(admin, ctx("r2"))
    await confirmTurn.record("create_donation", preview) // re-preview first
    expect(confirmTurn.consume("create_donation", preview)).toBe(true)
    await confirmTurn.finalize()

    expect((await openConfirmGate(admin, ctx("r3"))).consume("create_donation", preview)).toBe(false)
  })

  it("refuses a different change than the one previewed", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    const gate = await openConfirmGate(admin, ctx("r2"))
    expect(gate.consume("create_donation", { ...preview, amount: 2500 })).toBe(false)
  })

  it("approvals last exactly one follow-up request", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    await (await openConfirmGate(admin, ctx("r2"))).finalize() // user asked something else
    expect((await openConfirmGate(admin, ctx("r3"))).consume("create_donation", preview)).toBe(false)
  })

  it("expires previews after the TTL and clears expired leftovers", async () => {
    const { admin, rows } = fakeAdmin()
    const t0 = new Date("2026-11-06T12:00:00Z")
    const abandoned = await openConfirmGate(admin, ctx("r1", { now: t0 }))
    await abandoned.record("create_donation", preview) // request never finished
    const late = await openConfirmGate(admin, ctx("r2", { now: new Date(t0.getTime() + PREVIEW_TTL_MS + 1) }))
    expect(late.consume("create_donation", preview)).toBe(false)
    expect(rows()).toEqual([])
  })

  it("keeps users and orgs apart", async () => {
    const { admin } = fakeAdmin()
    await previewedIn(admin, "r1")
    expect((await openConfirmGate(admin, ctx("r2", { userId: "u-2" }))).consume("create_donation", preview)).toBe(false)
    expect((await openConfirmGate(admin, ctx("r2", { orgId: "org-2" }))).consume("create_donation", preview)).toBe(false)
    expect((await openConfirmGate(admin, ctx("r2"))).consume("create_donation", preview)).toBe(true)
  })

  it("stores a hash, not the donor details", async () => {
    const { admin, rows } = fakeAdmin()
    await (await openConfirmGate(admin, ctx("r1"))).record("create_donation", preview)
    expect(JSON.stringify(rows())).not.toContain("Delgados")
    expect(rows()[0].key_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("fails closed when the store is unavailable, and keeps the rows", async () => {
    const ok = fakeAdmin()
    await previewedIn(ok.admin, "r1")

    const broken = fakeAdmin({ failOpen: true })
    await previewedIn(broken.admin, "r1")
    const gate = await openConfirmGate(broken.admin, ctx("r2"))
    expect(gate.consume("create_donation", preview)).toBe(false)
    expect(broken.rows()).toHaveLength(1)

    const { admin: noInsert } = fakeAdmin({ failInsert: true })
    expect(await (await openConfirmGate(noInsert, ctx("r1"))).record("create_donation", preview)).toBe(false)
    expect(CLOSED_GATE.consume("create_donation", preview)).toBe(false)
  })
})
