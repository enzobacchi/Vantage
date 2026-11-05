import { describe, expect, it, vi } from "vitest"

import {
  deleteOrganizationData,
  removeOrphanedLogins,
  stripeCancelIfLive,
  type TeardownAdmin,
} from "./org-teardown"

type Op = string

/**
 * Fake service-role client. Records each operation as "table.op(filter=value)"
 * and lets a test fail one of them. Membership rows live in `memberships` and
 * are removed when their org is deleted, like the real ON DELETE CASCADE.
 */
function fakeAdmin(opts: {
  subscription?: { stripe_subscription_id: string | null; status: string } | null
  memberships?: Array<{ user_id: string; organization_id: string }>
  failOn?: Op
  failDeleteUser?: string
}) {
  const ops: Op[] = []
  let memberships = [...(opts.memberships ?? [])]
  const deletedUsers: string[] = []

  const result = (op: Op, data: unknown = null) => {
    ops.push(op)
    if (opts.failOn && op.startsWith(opts.failOn)) {
      return Promise.resolve({ data: null, error: { message: `${op} failed` }, count: null })
    }
    return Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : null })
  }

  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, value: string) {
              if (table === "subscriptions") {
                return { maybeSingle: () => result(`subscriptions.select(${col}=${value})`, opts.subscription ?? null) }
              }
              if (table === "organization_members") {
                const rows = memberships.filter((m) => (m as Record<string, string>)[col] === value)
                return result(`organization_members.select(${col}=${value})`, rows)
              }
              return result(`${table}.select(${col}=${value})`, [])
            },
          }
        },
        delete() {
          return {
            eq(col: string, value: string) {
              const op = `${table}.delete(${col}=${value})`
              const res = result(op)
              if (table === "organizations" && !(opts.failOn && op.startsWith(opts.failOn))) {
                memberships = memberships.filter((m) => m.organization_id !== value)
              }
              return res
            },
          }
        },
      }
    },
    auth: {
      admin: {
        deleteUser(id: string) {
          ops.push(`auth.deleteUser(${id})`)
          if (opts.failDeleteUser === id) {
            return Promise.resolve({ data: null, error: { message: "boom" } })
          }
          deletedUsers.push(id)
          return Promise.resolve({ data: {}, error: null })
        },
      },
    },
  }
  return { admin: admin as unknown as TeardownAdmin, ops, deletedUsers }
}

describe("deleteOrganizationData", () => {
  it("cancels Stripe first, then deletes donations, donors and the org row, in that order", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const { admin, ops } = fakeAdmin({ subscription: { stripe_subscription_id: "sub_1", status: "active" } })

    await deleteOrganizationData(admin, "org-1", { cancelSubscription: cancel })

    expect(cancel).toHaveBeenCalledWith("sub_1")
    expect(ops.filter((o) => o.includes(".delete("))).toEqual([
      "donations.delete(org_id=org-1)",
      "donors.delete(org_id=org-1)",
      "organizations.delete(id=org-1)",
    ])
  })

  it("skips Stripe when no Stripe subscription is linked", async () => {
    const cancel = vi.fn()
    const { admin } = fakeAdmin({ subscription: { stripe_subscription_id: null, status: "trialing" } })
    await deleteOrganizationData(admin, "org-1", { cancelSubscription: cancel })
    const { admin: admin2 } = fakeAdmin({ subscription: null })
    await deleteOrganizationData(admin2, "org-1", { cancelSubscription: cancel })
    expect(cancel).not.toHaveBeenCalled()
  })

  it("asks Stripe even when our row says canceled (the row can lag the webhook)", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const { admin } = fakeAdmin({ subscription: { stripe_subscription_id: "sub_1", status: "canceled" } })
    await deleteOrganizationData(admin, "org-1", { cancelSubscription: cancel })
    expect(cancel).toHaveBeenCalledWith("sub_1")
  })

  it("deletes nothing when the Stripe cancel fails", async () => {
    const cancel = vi.fn().mockRejectedValue(new Error("stripe down"))
    const { admin, ops } = fakeAdmin({ subscription: { stripe_subscription_id: "sub_1", status: "past_due" } })

    await expect(deleteOrganizationData(admin, "org-1", { cancelSubscription: cancel })).rejects.toThrow(
      /subscription/i
    )
    expect(ops.some((o) => o.includes(".delete("))).toBe(false)
  })

  it("stops at the first failed step and never deletes the org row", async () => {
    const { admin, ops } = fakeAdmin({ subscription: null, failOn: "donors.delete" })

    await expect(deleteOrganizationData(admin, "org-1", { cancelSubscription: vi.fn() })).rejects.toThrow()
    expect(ops).not.toContain("organizations.delete(id=org-1)")
  })

  it("fails when the subscription lookup fails, before touching data", async () => {
    const { admin, ops } = fakeAdmin({ failOn: "subscriptions.select" })
    await expect(deleteOrganizationData(admin, "org-1", { cancelSubscription: vi.fn() })).rejects.toThrow()
    expect(ops.some((o) => o.includes(".delete("))).toBe(false)
  })
})

describe("removeOrphanedLogins", () => {
  it("deletes only logins left with no organization", async () => {
    const { admin, deletedUsers } = fakeAdmin({
      memberships: [{ user_id: "u-shared", organization_id: "org-2" }],
    })

    const result = await removeOrphanedLogins(admin, ["u-owner", "u-shared", "u-member"])

    expect(deletedUsers.sort()).toEqual(["u-member", "u-owner"])
    expect(result.failed).toEqual([])
  })

  it("keeps going and reports logins it could not delete", async () => {
    const { admin, deletedUsers } = fakeAdmin({ failDeleteUser: "u-1" })

    const result = await removeOrphanedLogins(admin, ["u-1", "u-2"])

    expect(deletedUsers).toEqual(["u-2"])
    expect(result.failed).toEqual(["u-1"])
  })

  it("never deletes a login whose membership lookup fails", async () => {
    const { admin, deletedUsers } = fakeAdmin({ failOn: "organization_members.select" })

    const result = await removeOrphanedLogins(admin, ["u-1"])

    expect(deletedUsers).toEqual([])
    expect(result.failed).toEqual(["u-1"])
  })
})

describe("stripeCancelIfLive", () => {
  function fakeSubscriptions(status: string | Error) {
    return {
      retrieve: vi.fn(async () => {
        if (status instanceof Error) throw status
        return { status }
      }),
      cancel: vi.fn(async () => ({})),
    }
  }

  it("cancels a live subscription", async () => {
    const subs = fakeSubscriptions("active")
    await stripeCancelIfLive(subs)("sub_1")
    expect(subs.cancel).toHaveBeenCalledWith("sub_1")
  })

  it("treats an already-canceled subscription as done, so a retry isn't stuck", async () => {
    const subs = fakeSubscriptions("canceled")
    await stripeCancelIfLive(subs)("sub_1")
    expect(subs.cancel).not.toHaveBeenCalled()
  })

  it("treats a subscription Stripe doesn't know as done", async () => {
    const subs = fakeSubscriptions(Object.assign(new Error("No such subscription"), { code: "resource_missing" }))
    await expect(stripeCancelIfLive(subs)("sub_1")).resolves.toBeUndefined()
  })

  it("fails on any other Stripe error", async () => {
    const subs = fakeSubscriptions(new Error("api down"))
    await expect(stripeCancelIfLive(subs)("sub_1")).rejects.toThrow("api down")
  })
})
