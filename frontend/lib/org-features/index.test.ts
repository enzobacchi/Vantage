import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }))

import { logAuditEvent } from "@/lib/audit"

import {
  getOrgFeatures,
  isFeatureEnabled,
  resolveFeatures,
  setOrgFeature,
  type FeaturesAdmin,
} from "./index"
import { ORG_FEATURES, isOrgFeatureKey } from "./registry"

type Row = { org_id: string; feature_key: string; enabled: boolean }

/** Fake service-role client holding `org_features` rows in memory. */
function fakeAdmin(opts: { rows?: Row[]; failRead?: boolean; failWrite?: boolean } = {}) {
  const rows = [...(opts.rows ?? [])]
  const admin = {
    from(table: string) {
      if (table !== "org_features") throw new Error(`unexpected table ${table}`)
      return {
        select() {
          return {
            eq(_col: string, orgId: string) {
              if (opts.failRead) return Promise.resolve({ data: null, error: { message: "read failed" } })
              return Promise.resolve({ data: rows.filter((r) => r.org_id === orgId), error: null })
            },
          }
        },
        upsert(row: Row) {
          if (opts.failWrite) return Promise.resolve({ error: { message: "write failed" } })
          const i = rows.findIndex((r) => r.org_id === row.org_id && r.feature_key === row.feature_key)
          if (i >= 0) rows[i] = row
          else rows.push(row)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { admin: admin as unknown as FeaturesAdmin, rows }
}

describe("registry", () => {
  it("starts every partner feature off for everyone", () => {
    for (const key of ["touchpoint_meter", "quick_log", "giving_pacing"] as const) {
      expect(ORG_FEATURES[key].onForEveryone).toBe(false)
    }
  })

  it("recognises only registered keys", () => {
    expect(isOrgFeatureKey("touchpoint_meter")).toBe(true)
    expect(isOrgFeatureKey("not_a_feature")).toBe(false)
    expect(isOrgFeatureKey("toString")).toBe(false)
  })
})

describe("resolveFeatures", () => {
  it("uses the registry default when the org has no switch", () => {
    expect(resolveFeatures([]).touchpoint_meter).toBe(false)
  })

  it("lets an org switch turn a feature on", () => {
    const resolved = resolveFeatures([{ feature_key: "touchpoint_meter", enabled: true }])
    expect(resolved.touchpoint_meter).toBe(true)
    expect(resolved.quick_log).toBe(false)
  })

  it("ignores switches for keys no longer in the registry", () => {
    const resolved = resolveFeatures([{ feature_key: "retired_feature", enabled: true }])
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(ORG_FEATURES).sort())
  })
})

describe("getOrgFeatures / isFeatureEnabled", () => {
  it("is on for the partner org and off for everyone else", async () => {
    const { admin } = fakeAdmin({ rows: [{ org_id: "salt", feature_key: "touchpoint_meter", enabled: true }] })
    expect(await isFeatureEnabled("salt", "touchpoint_meter", admin)).toBe(true)
    expect(await isFeatureEnabled("ami", "touchpoint_meter", admin)).toBe(false)
  })

  it("honours an explicit off switch", async () => {
    const { admin } = fakeAdmin({ rows: [{ org_id: "salt", feature_key: "quick_log", enabled: false }] })
    expect(await isFeatureEnabled("salt", "quick_log", admin)).toBe(false)
  })

  it("falls back to the defaults when the lookup fails", async () => {
    const { admin } = fakeAdmin({ failRead: true })
    const features = await getOrgFeatures("salt", admin)
    expect(features.touchpoint_meter).toBe(false)
  })
})

describe("setOrgFeature", () => {
  it("saves the switch and writes an audit entry", async () => {
    const { admin, rows } = fakeAdmin()
    const result = await setOrgFeature(
      { orgId: "salt", key: "touchpoint_meter", enabled: true, actorUserId: "founder" },
      admin
    )
    expect(result).toEqual({ ok: true })
    expect(rows).toMatchObject([{ org_id: "salt", feature_key: "touchpoint_meter", enabled: true }])
    expect(await isFeatureEnabled("salt", "touchpoint_meter", admin)).toBe(true)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "salt",
        userId: "founder",
        action: "org_feature.enabled",
        details: { feature: "touchpoint_meter", enabled: true },
      })
    )
  })

  it("refuses a key that is not in the registry", async () => {
    const { admin, rows } = fakeAdmin()
    const result = await setOrgFeature(
      { orgId: "salt", key: "not_a_feature" as never, enabled: true, actorUserId: "founder" },
      admin
    )
    expect(result.ok).toBe(false)
    expect(rows).toEqual([])
  })

  it("reports a failed save and writes no audit entry", async () => {
    vi.mocked(logAuditEvent).mockClear()
    const { admin } = fakeAdmin({ failWrite: true })
    const result = await setOrgFeature(
      { orgId: "salt", key: "quick_log", enabled: true, actorUserId: "founder" },
      admin
    )
    expect(result.ok).toBe(false)
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
