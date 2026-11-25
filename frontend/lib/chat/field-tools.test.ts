import { beforeEach, describe, expect, it, vi } from "vitest"

import { previewKey, type ConfirmGate } from "./confirm-gate"
import { buildTools } from "./tools"

/**
 * Minimal Supabase fake for the chat write tools: records every insert and
 * answers donor lookups from an in-memory table keyed by (id, org_id).
 */
const donors = [
  { id: "11111111-1111-4111-8111-111111111111", org_id: "org-a", display_name: "Ruth Henderson" },
  { id: "22222222-2222-4222-8222-222222222222", org_id: "org-b", display_name: "Other Org Donor" },
]
const inserts: { table: string; row: Record<string, unknown> }[] = []

function fakeQuery(table: string) {
  const filters: Record<string, unknown> = {}
  let pendingInsert: Record<string, unknown> | null = null
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters[col] = val
      return q
    },
    maybeSingle: async () => {
      const row = donors.find((d) => d.id === filters.id && d.org_id === filters.org_id)
      return { data: row ?? null, error: null }
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row
      return q
    },
    single: async () => {
      if (!pendingInsert) return { data: null, error: { message: "no insert" } }
      inserts.push({ table, row: pendingInsert })
      return { data: { id: `new-${inserts.length}` }, error: null }
    },
  }
  return q
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => fakeQuery(table) }),
}))

type Exec = (input: Record<string, unknown>, opts: unknown) => Promise<Record<string, unknown>>
const opts = { toolCallId: "t1", messages: [] }

/** Previews recorded by the tools in this test (what the gate would store). */
const recorded: string[] = []

/** A gate that approves the given preview keys once each, like openConfirmGate does. */
function gateFor(approved: string[]): ConfirmGate {
  const keys = new Set(approved)
  return {
    record: async (tool, fields) => {
      recorded.push(previewKey(tool, fields))
      return true
    },
    consume: (tool, fields) => keys.delete(previewKey(tool, fields)),
    finalize: async () => {},
  }
}

function tools(approved: string[] = []) {
  const t = buildTools("org-a", "user-1", undefined, gateFor(approved))
  return {
    logInteraction: t.log_interaction.execute as unknown as Exec,
    createTask: t.create_task.execute as unknown as Exec,
  }
}

beforeEach(() => {
  inserts.length = 0
  recorded.length = 0
})

describe("log_interaction", () => {
  const input = {
    donor_id: "11111111-1111-4111-8111-111111111111",
    type: "meeting",
    date: "2026-10-29",
    subject: "Home visit",
    content: "Excited about the building fund.",
  }
  const approvedVisit = previewKey("log_interaction", { ...input, subject: "Home visit" })

  it("returns a preview and writes nothing without confirm", async () => {
    const result = await tools().logInteraction(input, opts)
    expect(result.requires_confirmation).toBe(true)
    expect(result.preview).toMatchObject({ donor_name: "Ruth Henderson", type: "meeting", date: "2026-10-29" })
    expect(inserts).toHaveLength(0)
    // The preview is recorded with the server-side gate, keyed like an approval.
    expect(recorded).toEqual([approvedVisit])
  })

  it("refuses to write a change the user never saw previewed", async () => {
    const result = await tools().logInteraction({ ...input, confirm: true }, opts)
    expect(String(result.error)).toMatch(/Not approved/)
    expect(inserts).toHaveLength(0)
  })

  it("refuses a confirm whose arguments differ from the approved preview", async () => {
    const result = await tools([approvedVisit]).logInteraction({ ...input, content: "Changed my mind", confirm: true }, opts)
    expect(String(result.error)).toMatch(/Not approved/)
    expect(inserts).toHaveLength(0)
  })

  it("inserts the interaction once confirmed", async () => {
    const result = await tools([approvedVisit]).logInteraction({ ...input, confirm: true }, opts)
    expect(result.success).toBe(true)
    expect(inserts).toEqual([
      {
        table: "interactions",
        row: {
          donor_id: "11111111-1111-4111-8111-111111111111",
          type: "meeting",
          direction: null,
          subject: "Home visit",
          content: "Excited about the building fund.",
          date: "2026-10-29T12:00:00.000Z",
          status: null,
        },
      },
    ])
  })

  it("uses an approval once: a second confirm of the same change is refused", async () => {
    const t = tools([approvedVisit])
    expect((await t.logInteraction({ ...input, confirm: true }, opts)).success).toBe(true)
    const again = await t.logInteraction({ ...input, confirm: true }, opts)
    expect(String(again.error)).toMatch(/Not approved/)
    expect(inserts).toHaveLength(1)
  })

  it("rejects a donor from another org, even with confirm", async () => {
    const result = await tools().logInteraction({ ...input, donor_id: "22222222-2222-4222-8222-222222222222", confirm: true }, opts)
    expect(result.error).toBeDefined()
    expect(inserts).toHaveLength(0)
  })

  it("rejects a privacy placeholder passed as the donor id", async () => {
    const result = await tools().logInteraction({ ...input, donor_id: "[DONOR_3]", confirm: true }, opts)
    expect(String(result.error)).toMatch(/search_donors/)
    expect(inserts).toHaveLength(0)
  })

  it("rejects a malformed date", async () => {
    const result = await tools().logInteraction({ ...input, date: "Friday", confirm: true }, opts)
    expect(result.error).toBeDefined()
    expect(inserts).toHaveLength(0)
  })
})

describe("create_task", () => {
  const input = { donor_id: "11111111-1111-4111-8111-111111111111", title: "Send thank-you note", due_date: "2026-10-30" }

  it("returns a preview and writes nothing without confirm", async () => {
    const result = await tools().createTask(input, opts)
    expect(result.requires_confirmation).toBe(true)
    expect(result.preview).toMatchObject({ donor_name: "Ruth Henderson", title: "Send thank-you note", due_date: "2026-10-30" })
    expect(inserts).toHaveLength(0)
  })

  it("refuses to write a task the user never saw previewed", async () => {
    const result = await tools().createTask({ ...input, confirm: true }, opts)
    expect(String(result.error)).toMatch(/Not approved/)
    expect(inserts).toHaveLength(0)
  })

  it("inserts a pending task interaction once confirmed", async () => {
    const result = await tools([previewKey("create_task", { ...input, notes: null })]).createTask({ ...input, confirm: true }, opts)
    expect(result.success).toBe(true)
    expect(inserts).toEqual([
      {
        table: "interactions",
        row: {
          donor_id: "11111111-1111-4111-8111-111111111111",
          type: "task",
          direction: null,
          subject: "Send thank-you note",
          content: "",
          date: "2026-10-30T12:00:00.000Z",
          status: "pending",
        },
      },
    ])
  })

  it("rejects a donor from another org, even with confirm", async () => {
    const result = await tools().createTask({ ...input, donor_id: "22222222-2222-4222-8222-222222222222", confirm: true }, opts)
    expect(result.error).toBeDefined()
    expect(inserts).toHaveLength(0)
  })

  it("rejects a malformed due date", async () => {
    const result = await tools().createTask({ ...input, due_date: "next week", confirm: true }, opts)
    expect(result.error).toBeDefined()
    expect(inserts).toHaveLength(0)
  })
})
