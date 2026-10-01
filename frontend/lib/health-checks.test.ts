import { describe, expect, it } from "vitest"
import { classifyQbOrgHealth, STALE_SYNC_HOURS, type QbOrgHealthInput } from "./health-checks"

const NOW = new Date("2026-07-05T12:00:00Z").getTime()

function org(overrides: Partial<QbOrgHealthInput> = {}): QbOrgHealthInput {
  return {
    id: "org-1",
    name: "Test Org",
    qb_needs_reconnect: false,
    qb_last_sync_error: null,
    last_synced_at: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1h ago
    ...overrides,
  }
}

describe("classifyQbOrgHealth", () => {
  it("returns null for a healthy recently-synced org", () => {
    expect(classifyQbOrgHealth(org(), NOW)).toBeNull()
  })

  it("flags needs_reconnect with the stored sync error", () => {
    const issue = classifyQbOrgHealth(
      org({ qb_needs_reconnect: true, qb_last_sync_error: "invalid_grant" }),
      NOW
    )
    expect(issue?.reason).toBe("needs_reconnect")
    expect(issue?.detail).toContain("invalid_grant")
  })

  it("flags needs_reconnect even without a stored error", () => {
    const issue = classifyQbOrgHealth(org({ qb_needs_reconnect: true }), NOW)
    expect(issue?.reason).toBe("needs_reconnect")
  })

  it("needs_reconnect takes precedence over staleness", () => {
    const issue = classifyQbOrgHealth(
      org({
        qb_needs_reconnect: true,
        last_synced_at: new Date(NOW - 100 * 60 * 60 * 1000).toISOString(),
      }),
      NOW
    )
    expect(issue?.reason).toBe("needs_reconnect")
  })

  it("flags a sync older than the staleness threshold", () => {
    const staleMs = (STALE_SYNC_HOURS + 1) * 60 * 60 * 1000
    const issue = classifyQbOrgHealth(
      org({ last_synced_at: new Date(NOW - staleMs).toISOString() }),
      NOW
    )
    expect(issue?.reason).toBe("stale_sync")
    expect(issue?.detail).toContain(`${STALE_SYNC_HOURS + 1}h`)
  })

  it("does not flag a sync just inside the threshold", () => {
    const freshMs = (STALE_SYNC_HOURS - 1) * 60 * 60 * 1000
    expect(
      classifyQbOrgHealth(org({ last_synced_at: new Date(NOW - freshMs).toISOString() }), NOW)
    ).toBeNull()
  })

  it("does not flag an org that has never synced", () => {
    expect(classifyQbOrgHealth(org({ last_synced_at: null }), NOW)).toBeNull()
  })
})
