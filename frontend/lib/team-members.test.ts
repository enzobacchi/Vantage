import { describe, expect, it } from "vitest"

import type { TeardownAdmin } from "./org-teardown"
import { removeOrgMember, removeMemberDenial } from "./team-members"

type Row = Record<string, unknown>

/**
 * In-memory stand-in for the service-role client: select / delete with .eq()
 * filters, `{ count: "exact", head: true }` counts, and auth.admin.deleteUser.
 * A test can make one table's delete (or every op on it) fail.
 */
function fakeAdmin(
  tables: Record<string, Row[]>,
  opts: {
    failDelete?: string
    failSelect?: string
    failUpdate?: string
    failDeleteUser?: boolean
    /** Runs right before a delete on this table, to simulate a concurrent change. */
    beforeDelete?: { table: string; run: (store: Record<string, Row[]>) => void }
  } = {}
) {
  const deletedUsers: string[] = []
  const store: Record<string, Row[]> = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  )

  const admin = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let mode: "select" | "delete" | "update" = "select"
      let countOnly = false
      let returning = false
      let patch: Row = {}
      const matches = () =>
        (store[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const run = () => {
        if (mode === "delete") {
          if (opts.failDelete === table) {
            return { data: null, error: { message: `${table} delete failed` }, count: null }
          }
          if (opts.beforeDelete?.table === table) opts.beforeDelete.run(store)
          const doomed = matches()
          const gone = new Set(doomed)
          store[table] = (store[table] ?? []).filter((r) => !gone.has(r))
          return { data: returning ? doomed : null, error: null, count: null }
        }
        if (mode === "update") {
          if (opts.failUpdate === table) {
            return { data: null, error: { message: `${table} update failed` }, count: null }
          }
          for (const r of matches()) Object.assign(r, patch)
          return { data: null, error: null, count: null }
        }
        if (opts.failSelect === table) {
          return { data: null, error: { message: `${table} select failed` }, count: null }
        }
        const rows = matches()
        return { data: countOnly ? null : rows, error: null, count: rows.length }
      }
      const builder = {
        select(_cols?: string, o?: { count?: string; head?: boolean }) {
          if (mode === "delete") returning = true
          countOnly = !!o?.head
          return builder
        },
        delete() {
          mode = "delete"
          return builder
        },
        update(values: Row) {
          mode = "update"
          patch = values
          return builder
        },
        eq(col: string, value: unknown) {
          filters.push([col, value])
          return builder
        },
        is(col: string, value: unknown) {
          filters.push([col, value])
          return builder
        },
        maybeSingle() {
          const res = run()
          const rows = (res.data as Row[] | null) ?? []
          return Promise.resolve({ ...res, data: res.error ? null : (rows[0] ?? null) })
        },
        then<T>(resolve: (v: ReturnType<typeof run>) => T, reject?: (e: unknown) => T) {
          return Promise.resolve(run()).then(resolve, reject)
        },
      }
      return builder
    },
    auth: {
      admin: {
        deleteUser(id: string) {
          if (opts.failDeleteUser) return Promise.resolve({ data: null, error: { message: "boom" } })
          deletedUsers.push(id)
          return Promise.resolve({ data: {}, error: null })
        },
      },
    },
  }
  return { admin: admin as unknown as TeardownAdmin, store, deletedUsers }
}

const ORG = "org-1"
const OTHER_ORG = "org-2"

function team(extra: Row[] = []) {
  return {
    organization_members: [
      { id: "m-owner", user_id: "u-owner", organization_id: ORG, role: "owner" },
      { id: "m-owner2", user_id: "u-owner2", organization_id: ORG, role: "owner" },
      { id: "m-admin", user_id: "u-admin", organization_id: ORG, role: "admin" },
      { id: "m-admin2", user_id: "u-admin2", organization_id: ORG, role: "admin" },
      { id: "m-member", user_id: "u-member", organization_id: ORG, role: "member" },
      { id: "x-member", user_id: "u-elsewhere", organization_id: OTHER_ORG, role: "member" },
      ...extra,
    ],
    gmail_credentials: [
      { org_id: ORG, user_id: "u-member" },
      { org_id: OTHER_ORG, user_id: "u-member" },
    ],
    push_tokens: [{ org_id: ORG, user_id: "u-member" }],
    notification_preferences: [{ org_id: ORG, user_id: "u-member" }],
    api_keys: [
      { id: "k-1", org_id: ORG, created_by: "u-member", revoked_at: null },
      { id: "k-2", org_id: ORG, created_by: "u-owner", revoked_at: null },
      { id: "k-3", org_id: OTHER_ORG, created_by: "u-member", revoked_at: null },
    ],
  }
}

const owner = { userId: "u-owner", orgId: ORG, role: "owner" }
const admin1 = { userId: "u-admin", orgId: ORG, role: "admin" }
const member = { userId: "u-member", orgId: ORG, role: "member" }

describe("removeMemberDenial (guard matrix)", () => {
  const cases: Array<[string, string, string, boolean]> = [
    // actor role, target role, label, allowed (target is never the actor here)
    ["owner", "owner", "owner removes another owner", true],
    ["owner", "admin", "owner removes an admin", true],
    ["owner", "member", "owner removes a member", true],
    ["admin", "owner", "admin removes an owner", false],
    ["admin", "admin", "admin removes another admin", false],
    ["admin", "member", "admin removes a member", true],
    ["member", "member", "member removes a member", false],
  ]
  it.each(cases)("%s → %s (%s)", (actorRole, targetRole, _label, allowed) => {
    const denial = removeMemberDenial(
      { userId: "actor", role: actorRole },
      { user_id: "target", role: targetRole }
    )
    expect(denial === null).toBe(allowed)
  })

  it("nobody can remove themselves, owners included", () => {
    for (const role of ["owner", "admin", "member"]) {
      expect(removeMemberDenial({ userId: "me", role }, { user_id: "me", role })).not.toBeNull()
    }
  })
})

describe("removeOrgMember", () => {
  it("removes the membership and that person's per-org rows", async () => {
    const { admin, store } = fakeAdmin(team([{ id: "m-member-x", user_id: "u-member", organization_id: OTHER_ORG, role: "member" }]))

    const result = await removeOrgMember(admin, owner, "m-member")

    expect(result).toEqual({ ok: true, removedUserId: "u-member" })
    expect(store.organization_members.find((m) => m.id === "m-member")).toBeUndefined()
    expect(store.gmail_credentials).toEqual([{ org_id: OTHER_ORG, user_id: "u-member" }])
    expect(store.push_tokens).toEqual([])
    expect(store.notification_preferences).toEqual([])
  })

  it("revokes only the org API keys the removed person created", async () => {
    const { admin, store } = fakeAdmin(team())
    await removeOrgMember(admin, owner, "m-member")
    const revoked = Object.fromEntries(store.api_keys.map((k) => [k.id, k.revoked_at !== null]))
    expect(revoked).toEqual({ "k-1": true, "k-2": false, "k-3": false })
  })

  it("reports nothing removed when the row is already gone (double-click)", async () => {
    const { admin, deletedUsers } = fakeAdmin(team(), {
      beforeDelete: {
        table: "organization_members",
        run: (store) => {
          store.organization_members = store.organization_members.filter((m) => m.id !== "m-member")
        },
      },
    })
    const result = await removeOrgMember(admin, owner, "m-member")
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(deletedUsers).toEqual([])
  })

  it("does nothing if the target was promoted after the role check", async () => {
    const { admin, store } = fakeAdmin(team(), {
      beforeDelete: {
        table: "organization_members",
        run: (s) => {
          const m = s.organization_members.find((r) => r.id === "m-member")
          if (m) m.role = "owner"
        },
      },
    })
    const result = await removeOrgMember(admin, admin1, "m-member")
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(store.organization_members.some((m) => m.id === "m-member")).toBe(true)
  })

  it("deletes the login of someone left with no organization", async () => {
    const { admin, deletedUsers } = fakeAdmin(team())
    await removeOrgMember(admin, admin1, "m-member")
    expect(deletedUsers).toEqual(["u-member"])
  })

  it("keeps the login of someone still in another organization", async () => {
    const { admin, deletedUsers } = fakeAdmin(
      team([{ id: "m-member-x", user_id: "u-member", organization_id: OTHER_ORG, role: "member" }])
    )
    await removeOrgMember(admin, owner, "m-member")
    expect(deletedUsers).toEqual([])
  })

  it("only finds members of the actor's own org", async () => {
    const { admin, store } = fakeAdmin(team())
    const result = await removeOrgMember(admin, owner, "x-member")
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(store.organization_members.some((m) => m.id === "x-member")).toBe(true)
  })

  it("refuses members, admins removing admins, and self-removal, changing nothing", async () => {
    const attempts: Array<[typeof owner, string, number]> = [
      [member, "m-admin", 403],
      [admin1, "m-admin2", 403],
      [admin1, "m-owner", 403],
      [owner, "m-owner", 400],
    ]
    for (const [actor, memberId, status] of attempts) {
      const { admin, store } = fakeAdmin(team())
      const result = await removeOrgMember(admin, actor, memberId)
      expect(result).toMatchObject({ ok: false, status })
      expect(store.organization_members).toHaveLength(6)
    }
  })

  it("never removes the last owner", async () => {
    // A lone owner can only be targeted by someone else; simulate a second
    // actor whose own owner row is already gone (e.g. a concurrent removal).
    const { admin, store } = fakeAdmin({
      organization_members: [
        { id: "m-owner", user_id: "u-owner", organization_id: ORG, role: "owner" },
      ],
    })
    const result = await removeOrgMember(admin, { userId: "u-ghost", orgId: ORG, role: "owner" }, "m-owner")
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(store.organization_members).toHaveLength(1)
  })

  it("reports a failed membership delete as an error", async () => {
    const { admin } = fakeAdmin(team(), { failDelete: "organization_members" })
    const result = await removeOrgMember(admin, owner, "m-member")
    expect(result).toMatchObject({ ok: false, status: 500 })
  })

  it("reports a failed lookup as an error, not as 'not found'", async () => {
    const { admin } = fakeAdmin(team(), { failSelect: "organization_members" })
    const result = await removeOrgMember(admin, owner, "m-member")
    expect(result).toMatchObject({ ok: false, status: 500 })
  })

  it("still succeeds, with a warning, when cleanup after removal fails", async () => {
    const { admin, store } = fakeAdmin(team(), {
      failDelete: "gmail_credentials",
      failUpdate: "api_keys",
      failDeleteUser: true,
    })
    const result = await removeOrgMember(admin, owner, "m-member")
    expect(result.ok).toBe(true)
    expect(result.ok && result.warning).toBeTruthy()
    expect(store.organization_members.some((m) => m.id === "m-member")).toBe(false)
  })
})
